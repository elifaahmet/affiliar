const Redis = require("ioredis");
const { logger } = require("../middlewares/logger");

const redisClient = new Redis({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  password: null,
  // No password, secured via IP restriction
});

redisClient.on("connect", () => {
  logger.info("redis.connect");
});

redisClient.on("subscribe", (channel, count) => {
  logger.info("redis.subscribe", { channel, count });
});

redisClient.on("pmessage", (pattern, channel, message) => {
  logger.debug("redis.pubsub.message", { pattern, channel, message });
});

redisClient.on("error", (err) => {
  logger.error("redis.error", { error: err });
});

module.exports = redisClient;
