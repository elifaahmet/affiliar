const { MongoClient } = require("mongodb");

const LOCK_ID = "_seed_lock";
const LOCK_TTL_MS = 10 * 60 * 1000; // 10 min

async function acquireSeedLock(uri, dbName) {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  const col = db.collection("locks");

  await col.createIndex({ _id: 1 }, { unique: true });

  const now = new Date();
  const cutoff = new Date(now.getTime() - LOCK_TTL_MS);

  const res = await col.findOneAndUpdate(
    {
      _id: LOCK_ID,
      $or: [{ lockedAt: { $lte: cutoff } }, { lockedAt: { $exists: false } }],
    },
    { $set: { lockedAt: now } },
    { upsert: true, returnDocument: "after" }
  );

  // If document existed and lockedAt is very recent (not expired), we don't own it
  if (
    res &&
    res.value &&
    res.value.lockedAt &&
    res.value.lockedAt > cutoff &&
    res.lastErrorObject &&
    !res.lastErrorObject.upserted
  ) {
    await client.close();
    throw new Error("Another seed run is in progress. Try again later.");
  }

  return {
    async release() {
      try {
        await col.deleteOne({ _id: LOCK_ID });
      } finally {
        await client.close();
      }
    },
  };
}

module.exports = { acquireSeedLock };
