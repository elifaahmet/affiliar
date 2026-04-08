// Reconcile counters with existing data in collections.
// Ensures counters.seq >= max(existing id) and >= configured start-1.

require("dotenv").config();
const { MongoClient } = require("mongodb");
const { logger } = require("../middlewares/logger");

// Keep this in sync with models that call getNextSequence and/or have numeric `id` in seeds.
// [modelName, configuredStartNextId]
const STARTS = [
  ["AffiliateUser", 1],
  ["Country", 1],
  ["Currency", 1],
  ["Language", 1],
  ["MarketingCode", 1],
  ["Player", 10000],
  ["Wallet", 100000],
  ["DepositTransactions", 100000000],
  ["WithdrawalTransaction", 100000000],
  ["GameRiskLimit", 1000],
  ["PlayerGameLimit", 200000],
  ["Provider", 100],
  ["Game", 10000],
];

// Explicit model->collection mapping for cases where model and collection differ
const COLLECTIONS = {
  AffiliateUser: "adminusers",
  Country: "countries",
  Currency: "currencies",
  Language: "languages",
  MarketingCode: "marketingcodes",
  Player: "players",
  Wallet: "wallets",
  Provider: "providers",
  Game: "games",
  GameRiskLimit: "generalcasinolimits",
  PlayerGameLimit: "playercasinolimits",
};

// naive pluralization fallback (mongoose default approximation)
function modelToCollection(model) {
  if (COLLECTIONS[model]) return COLLECTIONS[model];
  if (model === model.toLowerCase()) return model; // already a collection name
  return model.toLowerCase() + "s";
}

async function maxIdIn(db, collectionName) {
  try {
    const col = db.collection(collectionName);
    const doc = await col
      .find({ id: { $type: "number" } }, { projection: { id: 1 } })
      .sort({ id: -1 })
      .limit(1)
      .next();
    return doc?.id ?? null;
  } catch (_) {
    return null;
  }
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

  for (const [model, startNext] of STARTS) {
    const coll = modelToCollection(model);
    const maxExisting = await maxIdIn(db, coll);
    const desiredNext = Math.max(startNext, (maxExisting || 0) + 1);
    const desiredSeq = desiredNext - 1; // because getNextSequence does $inc then return

    const existing = await counters.findOne({ model });
    if (!existing) {
      await counters.insertOne({ model, seq: desiredSeq });
      logger.info("seed.counters_reconcile.init", {
        model,
        seq: desiredSeq,
        next: desiredNext,
        collection: coll,
        maxId: maxExisting,
      });
      continue;
    }

    if (existing.seq < desiredSeq) {
      await counters.updateOne({ model }, { $set: { seq: desiredSeq } });
      logger.info("seed.counters_reconcile.bump", {
        model,
        from: existing.seq,
        to: desiredSeq,
        next: desiredNext,
        collection: coll,
        maxId: maxExisting,
      });
    } else {
      logger.debug("seed.counters_reconcile.ok", {
        model,
        seq: existing.seq,
        desired: desiredSeq,
      });
    }
  }

  await client.close();
}

main().catch((err) => {
  logger.error("seed.counters_reconcile.failure", { error: err });
  process.exit(1);
});
