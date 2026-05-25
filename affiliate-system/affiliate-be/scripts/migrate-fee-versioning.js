"use strict";

/**
 * One-shot migration to adopt the versioned-fees schema.
 *
 *   1. Backfills effectiveFrom = createdAt on every existing
 *      OperatorFinancialSettings + ProviderFeeRate document.
 *   2. Stamps effectiveUntil = null (= currently active) on the same docs
 *      so the partial-unique index can take effect.
 *   3. Drops the old non-temporal unique indexes so Mongoose can build
 *      the new partial-unique ones on next connect.
 *
 * Idempotent — safe to re-run; only stamps docs that are still missing
 * the fields.
 *
 * Run with:  node scripts/migrate-fee-versioning.js
 */

require("dotenv").config();
const mongoose = require("mongoose");

const OperatorFinancialSettings = require("../models/OperatorFinancialSettings");
const ProviderFeeRate           = require("../models/ProviderFeeRate");

async function main() {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);

  // 1. Backfill effectiveFrom/effectiveUntil.
  const finRes = await OperatorFinancialSettings.collection.updateMany(
    { effectiveFrom: { $exists: false } },
    [{ $set: { effectiveFrom: "$createdAt", effectiveUntil: null } }],
  );
  console.log(
    "OperatorFinancialSettings backfilled:",
    finRes.modifiedCount,
    "rows",
  );

  const provRes = await ProviderFeeRate.collection.updateMany(
    { effectiveFrom: { $exists: false } },
    [{ $set: { effectiveFrom: "$createdAt", effectiveUntil: null } }],
  );
  console.log(
    "ProviderFeeRate backfilled:",
    provRes.modifiedCount,
    "rows",
  );

  // 2. Drop legacy non-temporal unique indexes so Mongoose rebuilds the
  //    new partial-unique ones cleanly. dropIndex throws if the index
  //    name doesn't exist — swallow that case so re-runs stay silent.
  for (const [model, oldIndexName] of [
    [OperatorFinancialSettings, "operatorId_1_brandId_1"],
    [ProviderFeeRate,           "operatorId_1_brandId_1_providerId_1"],
  ]) {
    try {
      await model.collection.dropIndex(oldIndexName);
      console.log("Dropped legacy index:", oldIndexName);
    } catch (err) {
      if (err.codeName === "IndexNotFound" || /not.*exist/i.test(err.message)) {
        console.log("Legacy index already gone:", oldIndexName);
      } else {
        throw err;
      }
    }
  }

  // 3. Sync the new indexes from the schema.
  await OperatorFinancialSettings.syncIndexes();
  await ProviderFeeRate.syncIndexes();
  console.log("Indexes synced.");

  await mongoose.disconnect();
  console.log("Done.");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
