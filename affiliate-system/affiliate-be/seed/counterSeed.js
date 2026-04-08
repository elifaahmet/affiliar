// GENERATED from pixupplay-db.counters.json
// Idempotent seeder for the `counters` collection.
// Inserts ONLY if missing; never modifies existing docs.
// Overrides: providers->100, GameRiskLimit->1000, games->10000

require("dotenv").config();
const { MongoClient } = require("mongodb");
const { logger } = require("../middlewares/logger");

const STARTS = [
  ["AffiliateUser", 1],
  ["Country", 1],
  ["Currency", 1],
  ["Language", 1],
  ["MarketingCode", 1],
  ["Players", 10000],
  ["Revenue", 1],
  ["Wallet", 100000],
  ["countries", 1],
  ["languages", 1],
  ["DepositTransactions", 100000000],
  ["WithdrawalTransactions", 100000000],
  ["WithdrawalTransaction", 100000000],
  ["Player", 10000],
  ["games", 10000],
  ["GameRiskLimit", 1000],
  ["PlayerGameLimit", 200000],
  ["providers", 100],
];

const ASSUME_INC_THEN_RETURN = true;

function seedValue(startAt) {
  return ASSUME_INC_THEN_RETURN ? startAt - 1 : startAt;
}

async function main() {
  const uri =
    process.env.MONGODB_MAIN_DB_URI ||
    process.env.MONGODB_URI ||
    "mongodb://localhost:27017/pixupplay-db";
  const dbName =
    process.env.MONGODB_MAIN_DB_NAME ||
    process.env.MONGODB_DB ||
    (uri.split("/").pop() || "pixupplay-db").split("?")[0];

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  const counters = db.collection("counters");

  try {
    await counters.createIndex({ model: 1 }, { unique: true });
  } catch (_) {
    /* ignore */
  }

  for (const [model, startAt] of STARTS) {
    const exists = await counters.findOne({ model });
    // If a counter for this model already exists, do nothing (idempotent)
    if (exists) {
      logger.info("seed.counters.skip", { model, seq: exists.seq });
      continue;
    }
    const doc = { model, seq: seedValue(startAt) };
    await counters.insertOne(doc);
    logger.info("seed.counters.insert", { model, seq: doc.seq, next: startAt });
  }
  await client.close();
}

main().catch((err) => {
  logger.error("seed.counters.failure", { error: err });
  process.exit(1);
});
