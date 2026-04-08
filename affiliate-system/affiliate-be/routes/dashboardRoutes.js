const express = require("express");
const axios = require("axios");
const redisClient = require("../redis/redisClient");
const router = express.Router();
const dayjs = require("dayjs");
const calculateDashboardData = require("../utils/calculateDashboardData");
const { toRedis } = require("../redis/dashboardService");
const calculatePlayerDashboardData = require("../utils/calculatePlayerDashboardData");
const backfillPlayerDashboard = require("../backfillPlayerToRedis");
const Player = require("../models/Player");
const isBetween = require("dayjs/plugin/isBetween");

const DepositTransaction = require("../models/DepositTransaction");
const WithdrawalTransaction = require("../models/WithdrawalTransaction");
const { MSG } = require("../middlewares/log-messages");
const { logger } = require("../middlewares/logger");

dayjs.extend(isBetween);

const getAffiliateAdminUserId = (req) => req?.adminUser?._id || null;

/**
 * Dedicated Axios client for the STATS API
 * - Uses base URL from env with a sensible default
 * - Short timeout to keep the dashboard snappy
 */
const STATS_API_BASE = process.env.STATS_API_BASE || "http://localhost:4020";

const scanKeys = async (pattern, count = 200) => {
  let cursor = "0";
  const keys = [];

  do {
    const [nextCursor, batch] = await redisClient.scan(
      cursor,
      "MATCH",
      pattern,
      "COUNT",
      count,
    );
    cursor = nextCursor;
    if (Array.isArray(batch) && batch.length) {
      keys.push(...batch);
    }
  } while (cursor !== "0");

  return keys;
};

/**
 * @swagger
 * tags:
 *   name: Dashboard
 *   description: Admin dashboard metrics and backfill operations
 */

/**
 * @swagger
 * /dashboard/dashboard:
 *   get:
 *     summary: Get daily dashboard metrics from Redis
 *     tags: [Dashboard]
 *     responses:
 *       200:
 *         description: Success with a date-keyed map of metrics
 *       500:
 *         description: Internal Server Error
 */
router.get("/dashboard", async (req, res) => {
  try {
    const keys = await scanKeys("dashchannel:*");
    const sortedKeys = keys.sort();
    const data = {};

    for (const key of sortedKeys) {
      const date = key.split(":")[1]; // extract YYYY-MM-DD
      data[date] = await redisClient.hgetall(key);
    }

    res.json({ success: true, data });
  } catch (err) {
    req.logMsg(MSG.DASHBOARD_FETCH_ERR, { error: err }, "error");
    res.status(500).json({ success: false, error: err });
  }
});

// Rebuild today's login data from database
router.post("/rebuild-today-logins", async (req, res) => {
  try {
    const today = dayjs().format("YYYY-MM-DD");
    const startOfDay = dayjs().startOf("day").toDate();
    const endOfDay = dayjs().endOf("day").toDate();

    // Get actual logins from database (adjust query based on your login tracking)
    const loggedInPlayers = await Player.find(
      {
        isDeleted: false,
        lastLogin: { $gte: startOfDay, $lte: endOfDay },
      },
      { _id: 1 },
    ).lean();

    // Clear today's Redis login data
    await redisClient.del(`unique:players:login:${today}`);

    // Rebuild unique login set ONLY
    if (loggedInPlayers.length > 0) {
      const playerIds = loggedInPlayers.map((p) => p._id.toString());
      await redisClient.sadd(`unique:players:login:${today}`, ...playerIds);
      await redisClient.expire(
        `unique:players:login:${today}`,
        60 * 60 * 24 * 63,
      );
    }

    // DON'T touch total_players_login - keep existing value

    const finalCounts = await Promise.all([
      redisClient.scard(`unique:players:login:${today}`),
      redisClient.hget(`dashchannel:${today}`, "total_players_login"),
    ]);

    return res.json({
      success: true,
      message:
        "Today's UNIQUE login data rebuilt (total_players_login unchanged)",
      data: {
        database_count: loggedInPlayers.length,
        redis_unique_count: finalCounts[0],
        redis_total_count: finalCounts[1],
        note: "Only unique logins rebuilt, total login count preserved",
      },
    });
  } catch (error) {
    console.error("Rebuild logins error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * @swagger
 * /dashboard/dashboard/backfill:
 *   post:
 *     summary: Trigger dashboard metrics backfill for last 63 days (async)
 *     tags: [Dashboard]
 *     responses:
 *       200:
 *         description: Backfill started in background
 */
router.post("/dashboard/backfill", async (req, res) => {
  res.json({ success: true, message: "Backfill started in background." });

  (async () => {
    logger.info("dashboard.backfill.cleanup.start");
    const pipeline = redisClient.pipeline();

    for (let i = 1; i <= 63; i++) {
      const dateKey = dayjs().subtract(i, "day").format("YYYY-MM-DD");
      pipeline.del(`dashchannel:${dateKey}`);
    }

    await pipeline.exec();
    logger.info("dashboard.backfill.cleanup.done");

    logger.info("dashboard.backfill.start");
    for (let i = 0; i <= 63; i++) {
      const date = dayjs().subtract(i, "day");
      const start = date.startOf("day").toDate();
      const end = date.endOf("day").toDate();
      const dateKey = date.format("YYYY-MM-DD");

      try {
        const data = await calculateDashboardData({ start, end });
        await toRedis(dateKey, data);
        logger.info("dashboard.backfill.saved", { dateKey });
      } catch (err) {
        req.logMsg(
          MSG.DASHBOARD_BACKFILL_ERR,
          { error: err, dateKey },
          "error",
        );
      }
    }

    logger.info("dashboard.backfill.complete");
  })();
});

/**
 * @swagger
 * /dashboard/lmtd-data:
 *   get:
 *     summary: Calculate dashboard metrics for a custom date range (limited)
 *     tags: [Dashboard]
 *     parameters:
 *       - in: query
 *         name: start
 *         required: true
 *         schema:
 *           type: string
 *         description: ISO date or parseable date string
 *       - in: query
 *         name: end
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Success with calculated metrics
 *       400:
 *         description: Missing start or end
 *       500:
 *         description: Failed to calculate
 */
router.get("/lmtd-data", async (req, res) => {
  const { start, end } = req.query;
  const affiliateAdminUserId = getAffiliateAdminUserId(req);

  if (!start || !end)
    return res.status(400).json({ error: "Missing start or end date" });

  const startDate = dayjs(start).startOf("day").toDate();
  const endDate = dayjs(end).endOf("day").toDate();

  try {
    const data = await calculateDashboardData({
      start: startDate,
      end: endDate,
      affiliateAdminUserId,
    });
    return res.json({ success: true, data });
  } catch (err) {
    req.logMsg(MSG.DASHBOARD_LMTD_ERR, { error: err, start, end }, "error");
    return res
      .status(500)
      .json({ error: "Failed to calculate dashboard data" });
  }
});

/**
 * @swagger
 * /dashboard/range:
 *   get:
 *     summary: Aggregate Redis dashboard metrics for a date range
 *     tags: [Dashboard]
 *     parameters:
 *       - in: query
 *         name: start
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: end
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Success with combined metrics and unique player counts
 *       400:
 *         description: Missing start or end
 *       500:
 *         description: Failed to fetch range data
 */
router.get("/range", async (req, res) => {
  const { start, end } = req.query;
  const affiliateAdminUserId = getAffiliateAdminUserId(req);

  if (!start || !end)
    return res.status(400).json({ error: "Missing start or end date" });

  try {
    const startDate = dayjs(start).startOf("day").toDate();
    const endDate = dayjs(end).endOf("day").toDate();

    const combined = await calculateDashboardData({
      start: startDate,
      end: endDate,
      affiliateAdminUserId,
    });

    const round2 = (value) => Number(Number(value || 0).toFixed(2));
    const formatMoney = (value) => {
      const rounded = round2(value);
      return rounded.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    };

    const moneyFields = [
      "total_deposits",
      "total_withdrawals",
      "pending_withdrawals",
      "total_corrections_up",
      "total_corrections_down",
    ];

    for (const field of moneyFields) {
      combined[field] = formatMoney(combined[field]);
    }

    return res.json({ success: true, data: combined });
  } catch (err) {
    req.logMsg(MSG.DASHBOARD_RANGE_ERR, { error: err, start, end }, "error");
    return res.status(500).json({ error: "Failed to fetch range data" });
  }
});

const statsRoutes = [
  {
    path: "/betting-stats",
    statsKey: "betting_stats_v2",
    logKey: "DASHBOARD_BETTING_STATS_ERR",
    fallbackMessage: "Failed to fetch betting statistics",
  },
  {
    path: "/bonus-conversions",
    statsKey: "bonus_conversions_v2",
    logKey: "DASHBOARD_BONUS_CONVERSIONS_ERR",
    fallbackMessage: "Failed to fetch bonus conversion statistics",
  },
  {
    path: "/bonus-kpis",
    statsKey: "bonus_kpis_v2",
    logKey: "DASHBOARD_BONUS_KPIS_ERR",
    fallbackMessage: "Failed to fetch bonus KPIs",
  },
  {
    path: "/player-kpis",
    statsKey: "player_kpis_v2",
    logKey: "DASHBOARD_PLAYER_KPIS_ERR",
    fallbackMessage: "Failed to fetch player KPIs",
  },
  {
    path: "/ggr",
    statsKey: "ggr_v2",
    logKey: "DASHBOARD_GGR_STATS_ERR",
    fallbackMessage: "Failed to fetch GGR statistics",
    requiresBy: true,
  },
  {
    path: "/topn-betted",
    statsKey: "topn_betted_v2",
    logKey: "DASHBOARD_TOPN_BETTED_ERR",
    fallbackMessage: "Failed to fetch top-N betted statistics",
  },
  {
    path: "/topn-profitable",
    statsKey: "topn_profitable_v2",
    logKey: "DASHBOARD_TOPN_PROFITABLE_ERR",
    fallbackMessage: "Failed to fetch top-N profitable statistics",
  },
  {
    path: "/total-bets",
    statsKey: "total_bets_v2",
    logKey: "DASHBOARD_TOTAL_BETS_ERR",
    fallbackMessage: "Failed to fetch total bets statistics",
  },
  {
    path: "/total-winnings",
    statsKey: "total_winnings_v2",
    logKey: "DASHBOARD_TOTAL_WINNINGS_ERR",
    fallbackMessage: "Failed to fetch total winnings statistics",
  },
  {
    path: "/unique-player-count",
    statsKey: "unique_player_count_v2",
    logKey: "DASHBOARD_UNIQUE_PLAYER_COUNT_ERR",
    fallbackMessage: "Failed to fetch unique player count statistics",
    requiresBy: true,
  },
];

for (const route of statsRoutes) {
  router.get(route.path, (req, res) => {
    if (route.requiresBy && !req.query?.by) {
      return res.status(400).json({
        error: "`by` query parameter is required for this endpoint",
      });
    }

    const statsEndpoint = STATS_V2_ENDPOINTS.get(route.statsKey);
    if (!statsEndpoint) {
      return res
        .status(500)
        .json({ error: "Stats configuration is missing for this route" });
    }
    return proxyStatsV2Endpoint(req, res, statsEndpoint, {
      logKey: route.logKey,
      fallbackMessage: route.fallbackMessage,
    });
  });
}

router.get("/player-wager/:playerId", async (req, res) => {
  const { playerId } = req.params;
  const queryString = buildStatsV2QueryString(req);
  const querySuffix = queryString ? `?${queryString}` : "";
  const statsUrl = `${STATS_API_BASE}/player_wager/${playerId}${querySuffix}`;

  try {
    const statsRes = await axios.get(statsUrl);
    return res.json({ success: true, data: statsRes.data });
  } catch (err) {
    if (isStatsUpstreamError(err)) {
      return res.status(502).json({
        error: "Failed to fetch data from STATS API",
        details: {
          message: err.message,
          code: err.code,
          status: err.response?.status,
        },
      });
    }

    req.logMsg?.(
      "DASHBOARD_PLAYER_WAGER_ERR",
      { error: err?.toString?.(), params: queryString },
      "error",
    );
    return res
      .status(500)
      .json({ error: "Failed to fetch player wager statistics" });
  }
});

// player based
/**
 * @swagger
 * /dashboard/dashboard/player-backfill:
 *   post:
 *     summary: Backfill per-player dashboard metrics (async)
 *     tags: [Dashboard]
 *     responses:
 *       200:
 *         description: Player backfill started
 */
router.post("/dashboard/player-backfill", async (req, res) => {
  res.json({
    success: true,
    message: "Player backfill started in background.",
  });

  // Start in background
  (async () => {
    try {
      await backfillPlayerDashboard();
    } catch (err) {
      req.logMsg(MSG.DASHBOARD_PLAYER_BACKFILL_ERR, { error: err }, "error");
    }
  })();
});

/**
 * @swagger
 * /dashboard/player/range:
 *   get:
 *     summary: Aggregate per-player metrics for a date range
 *     tags: [Dashboard]
 *     parameters:
 *       - in: query
 *         name: playerId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: start
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: end
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Success with combined player metrics
 *       400:
 *         description: Missing playerId, start, or end
 *       404:
 *         description: Player not found
 *       500:
 *         description: Server error
 */
router.get("/player/range", async (req, res) => {
  const { playerId, start, end } = req.query;
  const affiliateAdminUserId = getAffiliateAdminUserId(req);

  if (!playerId || !start || !end) {
    return res.status(400).json({ error: "Missing playerId, start, or end" });
  }

  try {
    const numericPlayerId = Number(playerId);
    if (!Number.isFinite(numericPlayerId)) {
      return res.status(400).json({ error: "Invalid playerId" });
    }

    const player = await Player.findOne({
      id: numericPlayerId,
      ...(affiliateAdminUserId ? { affiliateAdminUserId } : {}),
    })
      .select("_id")
      .lean();

    if (!player) return res.status(404).json({ error: "Player not found" });

    const from = dayjs(start);
    const to = dayjs(end);

    let keys = await scanKeys(`dashchannel-player:${player._id}:*`);

    keys = keys
      .filter((key) => {
        const [, , date] = key.split(":");
        return dayjs(date).isBetween(from, to, "day", "[]");
      })
      .sort();

    const combined = {
      total_deposits: 0,
      total_withdrawals: 0,
      pending_withdrawals: 0,
      total_corrections_up: 0,
      total_corrections_down: 0,
      total_players_correction: 0,
      player_balance: 0,
      deposits_count: 0,
      withdrawals_count: 0,
    };

    for (const key of keys) {
      const data = await redisClient.hgetall(key);

      const dailyDeposits =
        Number(data?.total_deposits || data?.total_deposit || 0) || 0;
      const dailyWithdrawals =
        Number(data?.total_withdrawals || data?.total_withdrawal || 0) || 0;

      combined.total_deposits += dailyDeposits;
      combined.total_withdrawals += dailyWithdrawals;

      for (const metric of Object.keys(combined)) {
        if (
          metric === "player_balance" ||
          metric === "total_deposits" ||
          metric === "total_withdrawals"
        ) {
          continue;
        }
        combined[metric] += Number(data?.[metric] || 0);
      }

      if (data.player_balance) {
        combined.player_balance = Number(data.player_balance);
      }
    }

    return res.json({ success: true, data: combined });
  } catch (err) {
    req.logMsg(
      MSG.DASHBOARD_PLAYER_RANGE_ERR,
      { error: err, playerId },
      "error",
    );
    return res.status(500).json({ error: "Server error" });
  }
});

/**
 * @swagger
 * /dashboard/player/lmtd-data:
 *   get:
 *     summary: Calculate per-player metrics for a custom date range
 *     tags: [Dashboard]
 *     parameters:
 *       - in: query
 *         name: playerId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: start
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: end
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Success with calculated metrics
 *       400:
 *         description: Missing playerId, start, or end
 *       404:
 *         description: Player not found
 *       500:
 *         description: Failed to generate data
 */
router.get("/player/lmtd-data", async (req, res) => {
  const { playerId, start, end } = req.query;
  const affiliateAdminUserId = getAffiliateAdminUserId(req);

  if (!playerId || !start || !end) {
    return res.status(400).json({ error: "Missing playerId, start, or end" });
  }

  try {
    const numericPlayerId = Number(playerId);
    if (!Number.isFinite(numericPlayerId)) {
      return res.status(400).json({ error: "Invalid playerId" });
    }

    const player = await Player.findOne({
      id: numericPlayerId,
      ...(affiliateAdminUserId ? { affiliateAdminUserId } : {}),
    })
      .select("_id")
      .exec();

    if (!player) {
      return res.status(404).json({ error: "Player not found" });
    }

    const startDate = dayjs(start).startOf("day").toDate();
    const endDate = dayjs(end).endOf("day").toDate();

    const data = await calculatePlayerDashboardData(
      player._id,
      startDate,
      endDate,
    );

    return res.json({ success: true, data });
  } catch (err) {
    req.logMsg(
      MSG.DASHBOARD_PLAYER_LMTD_ERR,
      { error: err, playerId, start, end },
      "error",
    );
    return res
      .status(500)
      .json({ success: false, error: "Failed to generate LMTD player data" });
  }
});

/**
 * @swagger
 * /dashboard/dashboard/player/all:
 *   get:
 *     summary: Dump all per-player dashboard keys from Redis
 *     tags: [Dashboard]
 *     responses:
 *       200:
 *         description: Success with keyed data
 *       500:
 *         description: Internal Server Error
 */
router.get("/dashboard/player/all", async (req, res) => {
  try {
    const keys = await scanKeys("dashchannel-player:*");
    const grouped = {};

    for (const key of keys) {
      const [, , playerId, date] = key.split(":");
      if (!grouped[playerId]) grouped[playerId] = {};
      grouped[playerId][date] = await redisClient.hgetall(key);
    }

    res.json({ success: true, data: grouped });
  } catch (err) {
    req.logMsg(MSG.DASHBOARD_PLAYER_ALL_ERR, { error: err }, "error");
    res.status(500).json({ success: false, error: err });
  }
});

// DEBUG: Check what's in the WebSocket cache
router.get("/debug-websocket-cache", async (req, res) => {
  try {
    const today = dayjs().format("YYYY-MM-DD");
    const cacheKey = `dash:latest:data:today:${today}`;

    const [cachedValue, actualRedisData] = await Promise.all([
      redisClient.get(cacheKey),
      redisClient.hgetall(`dashchannel:${today}`),
    ]);

    return res.json({
      success: true,
      data: {
        cache_key: cacheKey,
        cached_value: cachedValue ? JSON.parse(cachedValue) : null,
        actual_redis_data: actualRedisData,
        cache_exists: !!cachedValue,
      },
    });
  } catch (error) {
    console.error("Debug cache error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
