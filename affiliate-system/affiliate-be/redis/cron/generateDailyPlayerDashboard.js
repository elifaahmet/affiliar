const dayjs = require("dayjs");
const Player = require("../../models/Player");
const calculatePlayerDashboardData = require("../../utils/calculatePlayerDashboardData");
const redisClient = require("../redisClient");
const Currency = require("../../models/Currency");
const { logger } = require("../../middlewares/logger");

const generateDailyPlayerDashboard = async () => {
  const start = dayjs().subtract(1, "day").startOf("day").toDate();
  const end = dayjs().subtract(1, "day").endOf("day").toDate();
  const dateKey = dayjs(start).format("YYYY-MM-DD");

  const players = await Player.find({ isDeleted: false }).select("_id").lean();

  for (const player of players) {
    try {
      const stats = await calculatePlayerDashboardData(player._id, start, end);
      const redisKey = `dashchannel-player:${player._id}:${dateKey}`;
      await redisClient.hset(redisKey, stats);
      await redisClient.expire(redisKey, 60 * 60 * 24 * 34); // Optional: expire in 90 days
      logger.info("redis.player_dashboard.saved", {
        playerId: player._id,
        dateKey,
      });
    } catch (err) {
      logger.error("redis.player_dashboard.failed", {
        playerId: player._id,
        error: err,
      });
    }
  }

  logger.info("redis.player_dashboard.complete", { dateKey });
};

module.exports = generateDailyPlayerDashboard;
