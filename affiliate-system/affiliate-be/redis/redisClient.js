const { logger } = require("../middlewares/logger");

// Redis disabled — stub client that silently no-ops
const noop = () => Promise.resolve(null);
const noopNum = () => Promise.resolve(0);

const redisClient = {
  get: noop,
  set: noop,
  del: noop,
  exists: noopNum,
  expire: noop,
  setex: noop,
  sadd: noop,
  scard: noopNum,
  hget: noop,
  hgetall: () => Promise.resolve({}),
  scan: () => Promise.resolve(["0", []]),
  pipeline: () => ({
    hgetall: function() { return this; },
    exec: () => Promise.resolve([]),
  }),
  on: () => {},
  subscribe: noop,
  psubscribe: noop,
  publish: noop,
};

logger.info("redis.disabled — running without Redis");

module.exports = redisClient;
