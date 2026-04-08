const redis = require("./redisClient");
const dayjs = require("dayjs");
const { logger } = require("../middlewares/logger");

const DASHBOARD_PREFIX = "dashchannel:";

/**
 * Save full dashboard object to Redis hash.
 */
const toRedis = async (dateStr, data) => {
  const key = `${DASHBOARD_PREFIX}${dateStr}`;
  await redis.hmset(key, data);
  await redis.expire(key, 60 * 60 * 24 * 63); // 63 days TTL
};
async function publishPlayerWalletBalance(playerId, wallet) {
  const message = {
    data_type: "balance",
    data: {
      wallet_id: wallet._id.toString(),
      real_money_balance: parseFloat(wallet.total.toString()).toFixed(2),
    },
  };

  await redis.publish(
    `wallet-update:player:${playerId}`,
    JSON.stringify(message)
  );

  logger.info("redis.wallet.balance_published", {
    playerId,
    channel: `wallet-update:player:${playerId}`,
  });
}
/**
 * Incrementally update dashboard stats.
 */
const updateDashboard = async (dateStr, updates) => {
  const key = `${DASHBOARD_PREFIX}${dateStr}`;
  for (const [field, value] of Object.entries(updates)) {
    await redis.hincrbyfloat(key, field, parseFloat(value));
  }
  await redis.expire(key, 60 * 60 * 24 * 63);
};

/**
 * Update player-specific dashboard in Redis.
 */
const updatePlayerDashboard = async (playerId, dateStr, updates) => {
  const key = `dashchannel-player:${playerId}:${dateStr}`;
  for (const [field, value] of Object.entries(updates)) {
    await redis.hincrbyfloat(key, field, parseFloat(value));
  }
  await redis.expire(key, 60 * 60 * 24 * 63);
};
const publishPlayerDashboardUpdate = async (playerId) => {
  const dateStr = dayjs().format("YYYY-MM-DD");
  const data = await redis.hgetall(`dashchannel-player:${playerId}:${dateStr}`);

  await redis.publish(
    `dashchannel:data:player:${playerId}:${dateStr}`,
    JSON.stringify({ type: "player-dashboard", playerId, data })
  );
};

/**
 * Send notifications to player backend
 */

const publishPlayerNotification = async (playerId, notification) => {
  const channel = `notifications:player:${playerId.toString?.() ?? playerId}`;
  await redis.publish(channel, JSON.stringify(notification));
};

const publishPlayerForceLogout = async (playerId, payload) => {
  const channel = `notifications:player:${playerId.toString?.() ?? playerId}`;
  await redis.publish(channel, JSON.stringify(payload));
  logger.info("redis.player.force_logout_published", {
    playerId: playerId.toString?.() ?? String(playerId),
    channel,
  });
};

/**
 * Fetch dashboard stats for a given day from Redis.
 */
const fromRedis = async (dateStr) => {
  const key = `${DASHBOARD_PREFIX}${dateStr}`;
  return await redis.hgetall(key);
};

/**
 * Aggregate Redis dashboard stats across a date range.
 */
const aggregateRange = async (startDate, endDate) => {
  const total = {};
  for (
    let d = dayjs(startDate);
    d.isSame(endDate) || d.isBefore(endDate);
    d = d.add(1, "day")
  ) {
    const data = await fromRedis(d.format("YYYY-MM-DD"));
    for (const [key, value] of Object.entries(data)) {
      total[key] = (total[key] || 0) + parseFloat(value || 0);
    }
  }
  return total;
};

/**
 * Publish today's dashboard update to WebSocket subscribers.
 */
const publishDashboardUpdate = async () => {
  const dateKey = dayjs().format("YYYY-MM-DD");

  const [data, uniqueDeposits, uniqueLogins, uniqueWithdrawals] =
    await Promise.all([
      redis.hgetall(`dashchannel:${dateKey}`),
      redis.scard(`unique:players:deposit:${dateKey}`),
      redis.scard(`unique:players:login:${dateKey}`),
      redis.scard(`unique:players:withdrawal:${dateKey}`),
    ]);

  const enrichedData = {
    ...data,
    unique_players_deposit: uniqueDeposits,
    unique_players_withdrawal: uniqueWithdrawals,
    unique_players_login: uniqueLogins,
    // Keep total_players_login from data (total login events count)
    // Don't override it with uniqueLogins
  };
  logger.debug("dashboard.publish.enriched_data", { data: enrichedData });

  await redis.publish(
    `dashchannel:data:today:${dateKey}`,
    JSON.stringify({ type: "dashboard", data: enrichedData })
  );

  // Update the WebSocket cache so new connections get fresh data
  const cacheKey = `dash:latest:data:today:${dateKey}`;

  const cachePayload = {
    type: "dashboard",
    data: enrichedData,
  };

  // Set new cache data
  await redis.setex(cacheKey, 60 * 60 * 24, JSON.stringify(cachePayload));
};

module.exports = {
  toRedis,
  publishDashboardUpdate,
  updateDashboard,
  updatePlayerDashboard,
  fromRedis,
  aggregateRange,
  publishPlayerDashboardUpdate,
  publishPlayerWalletBalance,
  publishPlayerForceLogout,
  publishPlayerNotification,
};
