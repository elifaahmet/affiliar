const WebSocket = require("ws");
const Redis = require("ioredis");
const dayjs = require("dayjs");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const User = require("./models/User");
const connectDB = require("./config/db");
const calculateDashboardData = require("./utils/calculateDashboardData");
const { ROLES } = require("./utils/constants");
const { logger, logMsg } = require("./middlewares/logger");
const { MSG } = require("./middlewares/log-messages");
const { v4: uuidv4 } = require("uuid");

const SECRET_KEY = "your_secret_key";

connectDB();
const AFFILIATE_DASHBOARD_ROOM_PREFIX = "dashboard:affiliate:";

const wss = new WebSocket.Server({ port: process.env.SOCKET_PORT });
logMsg(MSG.WS_START, { port: process.env.SOCKET_PORT, service: "admin-ws" });

const redis = new Redis({
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: Number(process.env.REDIS_PORT) || 6379,
  password: null,
});

const redisSub = new Redis({
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: Number(process.env.REDIS_PORT) || 6379,
  password: null,
});

let currentDayStr = dayjs().format("YYYY-MM-DD");
function getTodayDashChannel() {
  return `dashchannel:data:today:${currentDayStr}`;
}

function getAffiliateDashboardRoom(affiliateAdminUserId) {
  return `${AFFILIATE_DASHBOARD_ROOM_PREFIX}${affiliateAdminUserId}`;
}

function getAffiliateDashboardCacheKey(affiliateAdminUserId, dateStr) {
  return `dash:latest:data:today:affiliate:${affiliateAdminUserId}:${dateStr}`;
}

function getAffiliateIdFromRoom(room) {
  if (!room || !room.startsWith(AFFILIATE_DASHBOARD_ROOM_PREFIX)) return null;
  return room.slice(AFFILIATE_DASHBOARD_ROOM_PREFIX.length);
}

function parseToken(rawToken) {
  if (!rawToken || typeof rawToken !== "string") return null;
  return rawToken.startsWith("Bearer ")
    ? rawToken.slice("Bearer ".length)
    : rawToken;
}

async function validateAffiliateRoomJoin(token, room) {
  const affiliateAdminUserId = getAffiliateIdFromRoom(room);
  if (!affiliateAdminUserId) {
    return { ok: true };
  }

  const parsedToken = parseToken(token);
  if (!parsedToken) {
    return { ok: false, reason: "Missing token" };
  }

  try {
    const decoded = jwt.verify(parsedToken, SECRET_KEY);
    if (!decoded?.sub) {
      return { ok: false, reason: "Invalid token payload" };
    }

    if (String(decoded.sub) !== String(affiliateAdminUserId)) {
      return { ok: false, reason: "Room access denied" };
    }

    const adminUser = await User.findById(decoded.sub)
      .select("_id role isDeleted")
      .lean();

    if (!adminUser || adminUser.isDeleted) {
      return { ok: false, reason: "User not found" };
    }

    if (adminUser.role !== ROLES.AFFILIATE) {
      return { ok: false, reason: "Role is not affiliate" };
    }

    return {
      ok: true,
      affiliateAdminUserId: String(adminUser._id),
    };
  } catch (error) {
    return { ok: false, reason: "Invalid token" };
  }
}

async function buildAffiliateDashboardPayload(affiliateAdminUserId, dateStr) {
  const startDate = dayjs(dateStr).startOf("day").toDate();
  const endDate = dayjs(dateStr).endOf("day").toDate();

  const dashboardData = await calculateDashboardData({
    start: startDate,
    end: endDate,
    affiliateAdminUserId,
  });

  const payload = {
    type: "dashboard",
    data: dashboardData,
  };

  await redis.setex(
    getAffiliateDashboardCacheKey(affiliateAdminUserId, dateStr),
    60 * 60 * 24,
    JSON.stringify(payload),
  );

  return payload;
}

async function sendAffiliateDashboardSnapshot(ws, affiliateAdminUserId) {
  const room = getAffiliateDashboardRoom(affiliateAdminUserId);
  const cacheKey = getAffiliateDashboardCacheKey(affiliateAdminUserId, currentDayStr);

  let payload = null;
  const cachedPayload = await redis.get(cacheKey);

  if (cachedPayload) {
    payload = JSON.parse(cachedPayload);
  } else {
    payload = await buildAffiliateDashboardPayload(affiliateAdminUserId, currentDayStr);
  }

  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ room, data: payload }));
  }
}

function getActiveAffiliateRooms() {
  return Array.from(roomClients.keys()).filter((room) =>
    room.startsWith(AFFILIATE_DASHBOARD_ROOM_PREFIX),
  );
}

async function broadcastAffiliateDashboardsForDate(dateStr) {
  const affiliateRooms = getActiveAffiliateRooms();
  if (!affiliateRooms.length) return;

  const affiliateIds = [...new Set(affiliateRooms.map(getAffiliateIdFromRoom).filter(Boolean))];
  const payloadMap = new Map();

  for (const affiliateId of affiliateIds) {
    try {
      const payload = await buildAffiliateDashboardPayload(affiliateId, dateStr);
      payloadMap.set(affiliateId, payload);
    } catch (error) {
      logger.error("ws.affiliate_dashboard_build_failed", {
        affiliateId,
        dateStr,
        error,
      });
    }
  }

  for (const room of affiliateRooms) {
    if (!roomClients.has(room)) continue;

    const affiliateId = getAffiliateIdFromRoom(room);
    const payload = payloadMap.get(affiliateId);
    if (!payload) continue;

    for (const client of roomClients.get(room)) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ room, data: payload }));
      }
    }
  }
}

redisSub.psubscribe("player_status:*");
redisSub.psubscribe(getTodayDashChannel());
redisSub.psubscribe("dashchannel:data:player:*");

const roomClients = new Map();

function joinRoom(ws, room) {
  if (!roomClients.has(room)) {
    roomClients.set(room, new Set());
  }
  roomClients.get(room).add(ws);

  if (!ws.rooms) ws.rooms = new Set();
  ws.rooms.add(room);

  logMsg(MSG.WS_JOIN_ROOM, { room, ws_id: ws._id });
}

function leaveRoom(ws, room) {
  if (roomClients.has(room)) {
    roomClients.get(room).delete(ws);
    if (roomClients.get(room).size === 0) {
      roomClients.delete(room);
    }
  }
  if (ws.rooms) ws.rooms.delete(room);

  logMsg(MSG.WS_LEAVE_ROOM, { room, ws_id: ws._id });
}

function leaveAllRooms(ws) {
  if (ws.rooms) {
    for (const room of ws.rooms) {
      leaveRoom(ws, room);
    }
  }
}

wss.on("connection", (ws) => {
  ws._id = uuidv4();
  logMsg(MSG.WS_CONN, { ws_id: ws._id });

  ws.isAlive = true;
  ws.on("pong", () => {
    ws.isAlive = true;
  });

  const pingInterval = setInterval(() => {
    if (ws.isAlive === false) {
      logMsg(MSG.WS_PING_MISSED, { ws_id: ws._id }, "warn");
      return ws.terminate();
    }
    ws.isAlive = false;
    if (ws.readyState === WebSocket.OPEN) ws.ping();
  }, 30000);

  setInterval(async () => {
    const newDayStr = dayjs().format("YYYY-MM-DD");
    if (newDayStr !== currentDayStr) {
      const oldChannel = getTodayDashChannel();
      const newChannel = `dashchannel:data:today:${newDayStr}`;
      logMsg(MSG.WS_RESUB_DAY, { from: currentDayStr, to: newDayStr });

      try {
        await redisSub.punsubscribe(oldChannel);
        await redisSub.psubscribe(newChannel);
        currentDayStr = newDayStr;
      } catch (err) {
        logMsg(MSG.REDIS_SUB_ERR, { error: err }, "error");
      }
    }
  }, 30000);

  ws.on("message", async (msg) => {
    try {
      const parsed = JSON.parse(msg);
      const { action, room, token } = parsed;

      if (action === "join" && room) {
        const validation = await validateAffiliateRoomJoin(token, room);
        if (!validation.ok) {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                event: "error",
                room,
                message: validation.reason,
              }),
            );
          }
          return;
        }

        joinRoom(ws, room);

        if (room.startsWith("player:")) {
          const playerId = room.split(":")[1];
          const status = await redis.get(`online:player:${playerId}`);
          const payload = {
            playerId,
            status: status ? "online" : "offline",
            timestamp: Date.now(),
          };
          ws.send(JSON.stringify({ room, data: payload }));
        }

        if (room === "dashboard") {
          const key = `dash:latest:data:today:${currentDayStr}`;
          const value = await redis.get(key);
          if (value) {
            ws.send(JSON.stringify({ room, data: JSON.parse(value) }));
          }
        }

        if (room.startsWith(AFFILIATE_DASHBOARD_ROOM_PREFIX)) {
          await sendAffiliateDashboardSnapshot(ws, validation.affiliateAdminUserId);
        }

        if (room.startsWith("player-dashboard:")) {
          const playerId = room.split(":")[1];
          const key = `dash:latest:data:player:${playerId}`;
          const value = await redis.get(key);
          if (value) {
            ws.send(JSON.stringify({ room, data: JSON.parse(value) }));
          }
        }
      }

      if (action === "leave" && room) {
        leaveRoom(ws, room);
      }
    } catch (err) {
      logMsg(MSG.WS_MSG_PARSE_ERR, { error: err }, "warn");
    }
  });

  ws.on("close", () => {
    clearInterval(pingInterval);
    leaveAllRooms(ws);
    logMsg(MSG.WS_DISCONN, { ws_id: ws._id });
  });

  ws.on("error", (err) => {
    clearInterval(pingInterval);
    leaveAllRooms(ws);
    logMsg(MSG.WS_ERR, { error: err, ws_id: ws._id }, "error");
  });
});

redisSub.on("ready", () => logMsg(MSG.REDIS_SUB_READY));
redisSub.on("connect", () => logMsg(MSG.REDIS_SUB_CONNECT));
redisSub.on("close", () => logMsg(MSG.REDIS_SUB_CLOSE, null, "warn"));
redisSub.on("reconnecting", (delay) =>
  logMsg(MSG.REDIS_SUB_RECONNECT, { delay }, "warn"),
);
redisSub.on("error", (err) =>
  logMsg(MSG.REDIS_SUB_ERR, { error: err }, "error"),
);
redisSub.on("end", () => logMsg(MSG.REDIS_SUB_END, null, "warn"));

redisSub.on("pmessage", async (pattern, channel, message) => {
  try {
    const payload = JSON.parse(message);
    let room = null;

    if (channel.startsWith("player_status:")) {
      const playerId = channel.split(":")[1];
      room = `player:${playerId}`;
    } else if (channel.startsWith("dashchannel:data:today:")) {
      room = "dashboard";
      const dateStr = channel.split(":")[3] || currentDayStr;
      await broadcastAffiliateDashboardsForDate(dateStr);
    } else if (channel.startsWith("dashchannel:data:player:")) {
      const parts = channel.split(":");
      const playerId = parts[3];
      room = `player-dashboard:${playerId}`;
    }

    if (room && roomClients.has(room)) {
      for (const client of roomClients.get(room)) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ room, data: payload }));
        }
      }
    }
  } catch (err) {
    logMsg(MSG.REDIS_PUB_HANDLE_ERR, { error: err, channel }, "error");
  }
});

