"use strict";

/**
 * One-shot migration for the Sans Getirsin removal.
 *
 * The payout rows carried Sans-named provider metadata even after the
 * Coinflux migration — the Coinflux withdrawalId was being written into
 * `sansTransactionId`. This renames the three fields to provider-neutral
 * names on both payout collections:
 *
 *   sansTransactionId  → providerTransactionId
 *   sansRequestPayload → providerRequestPayload
 *   sansResponse       → providerResponse
 *
 * Also drops the legacy `sansTransactionId_1` index; Mongoose builds the
 * `providerTransactionId_1` one from the schema on next connect.
 *
 * Idempotent — `$rename` only touches docs that still have the old field,
 * and a missing index is treated as already-done.
 *
 * Run with:  node scripts/migrate-sans-fields-to-provider.js
 */

require("dotenv").config();
const mongoose = require("mongoose");

const AffiliatePayout    = require("../models/AffiliatePayout");
const SubAffiliatePayout = require("../models/SubAffiliatePayout");

const RENAMES = {
  sansTransactionId:  "providerTransactionId",
  sansRequestPayload: "providerRequestPayload",
  sansResponse:       "providerResponse",
};

async function main() {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);

  for (const model of [AffiliatePayout, SubAffiliatePayout]) {
    const name = model.modelName;

    for (const [from, to] of Object.entries(RENAMES)) {
      const res = await model.collection.updateMany(
        { [from]: { $exists: true } },
        { $rename: { [from]: to } },
      );
      console.log(`${name}: ${from} → ${to} —`, res.modifiedCount, "rows");
    }

    // dropIndex throws when the name doesn't exist — swallow that so
    // re-runs stay silent.
    try {
      await model.collection.dropIndex("sansTransactionId_1");
      console.log(`${name}: dropped legacy index sansTransactionId_1`);
    } catch (err) {
      if (err.codeName === "IndexNotFound" || /not.*exist|index not found/i.test(err.message)) {
        console.log(`${name}: legacy index already gone`);
      } else {
        throw err;
      }
    }

    await model.syncIndexes();
    console.log(`${name}: indexes synced`);
  }

  await mongoose.disconnect();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
