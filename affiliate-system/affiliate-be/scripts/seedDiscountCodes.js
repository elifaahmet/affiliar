"use strict";

/**
 * Seed / upsert fixed-amount discount codes for subscription billing.
 *
 *   node scripts/seedDiscountCodes.js
 *
 * Discount codes are platform-owned — there's no operator-facing UI. Edit
 * the CODES array below and re-run; it upserts by `code`, so it's safe to
 * run repeatedly. redemptionCount is never reset by the upsert.
 *
 * Each entry:
 *   code           required — matched case-insensitively at checkout
 *   amountUsd      required — flat USD knocked off the plan price
 *   expiresAt      optional — Date or null (null = never expires)
 *   maxRedemptions optional — number or null (null = unlimited)
 *   note           optional — free-text label
 */

require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const DiscountCode = require("../models/DiscountCode");

const CODES = [
  { code: "WELCOME50", amountUsd: 50,  expiresAt: null, maxRedemptions: null, note: "Evergreen welcome offer" },
  { code: "LAUNCH100", amountUsd: 100, expiresAt: null, maxRedemptions: 100,  note: "Launch promo — first 100 redemptions" },
];

async function run() {
  await connectDB();
  for (const c of CODES) {
    const code = String(c.code).trim().toUpperCase();
    const res = await DiscountCode.updateOne(
      { code },
      {
        $set: {
          code,
          amountUsd: c.amountUsd,
          active: c.active !== false,
          expiresAt: c.expiresAt ?? null,
          maxRedemptions: c.maxRedemptions ?? null,
          note: c.note ?? "",
        },
        // redemptionCount lives only on insert — never stomp existing usage.
        $setOnInsert: { redemptionCount: 0 },
      },
      { upsert: true },
    );
    const action = res.upsertedCount ? "created" : "updated";
    console.log(`  ${action}: ${code}  -$${c.amountUsd}`);
  }
  console.log(`Done — ${CODES.length} discount code(s) seeded.`);
  await mongoose.connection.close();
}

run().catch((err) => {
  console.error("seedDiscountCodes failed:", err.message);
  process.exit(1);
});
