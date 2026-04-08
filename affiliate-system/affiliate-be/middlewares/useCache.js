const cacheManager = require("memory-cache");
const { logger } = require("./logger");

const useCache = (duration) => {
  return (req, res, next) => {
    const key = "__express__" + (req.originalUrl || req.url);

    const cachedBody = cacheManager.get(key);
    if (cachedBody) {
      logger.debug("cache.hit", { key });
      return res.send(cachedBody);
    }

    res.sendResponse = res.send;
    res.send = (body) => {
      cacheManager.put(key, body, duration * 1000);
      logger.debug("cache.set", { key, durationSeconds: duration });
      res.sendResponse(body);
    };

    next();
  };
};

module.exports = {
  useCache,
};
