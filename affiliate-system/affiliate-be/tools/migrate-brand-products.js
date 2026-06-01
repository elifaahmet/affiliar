/**
 * Idempotent backfill. Sets Brand.products = ['casino', 'sportsbook'] on
 * any existing brand that doesn't already carry the field, so the new
 * schema default surfaces in reads without changing legacy semantics. A
 * brand that's already been explicitly narrowed (e.g. casino-only via the
 * admin UI) is left alone.
 *
 *   node tools/migrate-brand-products.js
 */
"use strict";

const mongoose = require("mongoose");
require("dotenv").config();
const connectDB = require("../config/db");
const Brand = require("../models/Brand");

(async () => {
  await connectDB();

  const res = await Brand.updateMany(
    {
      $or: [
        { products: { $exists: false } },
        { products: { $size: 0 } },
        { products: null },
      ],
    },
    { $set: { products: ["casino", "sportsbook"] } },
  );

  console.log(
    `Done. matched=${res.matchedCount} modified=${res.modifiedCount}`,
  );

  await mongoose.connection.close();
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
