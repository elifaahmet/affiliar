const redisClient = require("./redisClient");

const scanKeys = async (pattern, count = 200) => {
  const keys = [];
  let cursor = "0";

  do {
    const [nextCursor, batch] = await redisClient.scan(
      cursor,
      "MATCH",
      pattern,
      "COUNT",
      count
    );
    cursor = nextCursor;
    if (Array.isArray(batch) && batch.length) {
      keys.push(...batch);
    }
  } while (cursor !== "0");

  return keys;
};

module.exports = { scanKeys };
