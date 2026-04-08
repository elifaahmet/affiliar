#!/usr/bin/env node
"use strict";

/**
 * Test data seeder for local development.
 *
 * Creates a deterministic set of ClickHouse + MongoDB records
 * so you can verify the commission calculation end-to-end.
 *
 * Usage:
 *   node scripts/seedTestData.js
 *
 * What it prints at the end:
 *   Expected commission per affiliate (hand-calculated) so you
 *   can compare against GET /api/commission/reports/calculate.
 */

require("dotenv").config();

const clickhouse  = require("../config/clickhouse");
const connectDB   = require("../config/db");
const mongoose    = require("mongoose");

const User             = require("../models/User");
const AffiliateProfile = require("../models/AffiliateProfile");
const CommissionPlan   = require("../models/CommissionPlan");

// ── Config — edit these to match your local setup ─────────────────────────────

const OPERATOR_EMAIL = "operator@test.local";
const TEST_MONTH     = { year: 2025, month: 4 }; // April 2025

// ── Test scenarios ────────────────────────────────────────────────────────────
//
// We'll create 3 affiliates, each on a different plan:
//
//  A1 — 30% NGR revshare
//       Data: NGR=€3000, GGR=€3500, FTDs=8
//       Expected: 30% × €3000 = €900
//
//  A2 — CPA €50 per FTD
//       Data: NGR=€2000, GGR=€2400, FTDs=12
//       Expected: 12 × €50 = €600
//
//  A3 — Tiered revshare (€0-€999→20%, €1000-€4999→25%, €5000+→35%)
//       Data: NGR=€6000, GGR=€6500, FTDs=20
//       Expected: 35% × €6000 = €2100
//
// A4 — Hybrid (20% NGR + €30 CPA), NEGATIVE NGR month
//       Data: NGR=-€500, GGR=€200, FTDs=5
//       Expected: revshare=€0 (clamped), CPA=5×€30=€150 → total €150

const AFFILIATES = [
  {
    username:  "aff_revshare",
    email:     "aff.revshare@test.local",
    name:      "RevShare Affiliate",
    plan:      "revshare",
    ngrCents:  300_000,
    ggrCents:  350_000,
    ftdCount:  8,
    expected:  90_000,  // 30% of 300_000
  },
  {
    username:  "aff_cpa",
    email:     "aff.cpa@test.local",
    name:      "CPA Affiliate",
    plan:      "cpa",
    ngrCents:  200_000,
    ggrCents:  240_000,
    ftdCount:  12,
    expected:  60_000,  // 12 × 5000
  },
  {
    username:  "aff_tiered",
    email:     "aff.tiered@test.local",
    name:      "Tiered Affiliate",
    plan:      "tiered",
    ngrCents:  600_000,
    ggrCents:  650_000,
    ftdCount:  20,
    expected:  210_000, // 35% of 600_000
  },
  {
    username:  "aff_hybrid_negngr",
    email:     "aff.hybrid@test.local",
    name:      "Hybrid Neg-NGR Affiliate",
    plan:      "hybrid",
    ngrCents:  -50_000,
    ggrCents:   20_000,
    ftdCount:  5,
    expected:  15_000,  // revshare=0, CPA=5×3000=15000
  },
];

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  await connectDB();

  // -- Find operator --
  const operator = await User.findOne({ email: OPERATOR_EMAIL, role: "operator" }).lean();
  if (!operator) {
    console.error(`\nOperator not found: ${OPERATOR_EMAIL}`);
    console.error("Create an operator account first and update OPERATOR_EMAIL in this script.\n");
    process.exit(1);
  }
  const tenantId  = operator.operatorId.toString();
  console.log(`\n✓ Operator found: ${operator.email} (tenantId: ${tenantId})`);

  // -- Create commission plans --
  const [planRevshare, planCpa, planTiered, planHybrid] = await Promise.all([
    CommissionPlan.findOneAndUpdate(
      { operatorId: operator.operatorId, name: "[TEST] 30% NGR Revshare" },
      { operatorId: operator.operatorId, name: "[TEST] 30% NGR Revshare",
        type: "revshare", revshare: { metric: "ngr", rate: 30 }, isDefault: false, isActive: true },
      { upsert: true, new: true },
    ),
    CommissionPlan.findOneAndUpdate(
      { operatorId: operator.operatorId, name: "[TEST] €50 CPA" },
      { operatorId: operator.operatorId, name: "[TEST] €50 CPA",
        type: "cpa", cpa: { amountCents: 5000, currency: "EUR" }, isDefault: false, isActive: true },
      { upsert: true, new: true },
    ),
    CommissionPlan.findOneAndUpdate(
      { operatorId: operator.operatorId, name: "[TEST] Tiered Revshare" },
      { operatorId: operator.operatorId, name: "[TEST] Tiered Revshare",
        type: "tiered_revshare",
        tiers: [
          { fromCents:       0, toCents:  99_900, rate: 20 },
          { fromCents: 100_000, toCents: 499_900, rate: 25 },
          { fromCents: 500_000, toCents:    null, rate: 35 },
        ],
        isDefault: false, isActive: true },
      { upsert: true, new: true },
    ),
    CommissionPlan.findOneAndUpdate(
      { operatorId: operator.operatorId, name: "[TEST] Hybrid 20%+€30" },
      { operatorId: operator.operatorId, name: "[TEST] Hybrid 20%+€30",
        type: "hybrid",
        revshare: { metric: "ngr", rate: 20 },
        cpa: { amountCents: 3000, currency: "EUR" },
        isDefault: false, isActive: true },
      { upsert: true, new: true },
    ),
  ]);

  const planMap = { revshare: planRevshare, cpa: planCpa, tiered: planTiered, hybrid: planHybrid };
  console.log("✓ Commission plans created/updated");

  // -- Create affiliate users + profiles --
  const affiliateIds = [];

  for (const aff of AFFILIATES) {
    const user = await User.findOneAndUpdate(
      { email: aff.email },
      {
        email: aff.email, username: aff.username, name: aff.name,
        password: "PENDING", role: "affiliate", status: "active",
        operatorId: operator.operatorId, isDeleted: false,
      },
      { upsert: true, new: true },
    );

    const code = `TEST_${aff.username.toUpperCase()}`;
    await AffiliateProfile.findOneAndUpdate(
      { user: user._id },
      { user: user._id, referralCodes: [code],
        operatorUser: operator._id, commissionPlanId: planMap[aff.plan]._id },
      { upsert: true, new: true },
    );

    affiliateIds.push({ ...aff, _id: user._id.toString(), code });
    console.log(`  ✓ Affiliate: ${aff.username} (${code}) → plan: ${aff.plan}`);
  }

  // -- Insert ClickHouse rows --
  // One aggregated row per affiliate for the test month
  const { year, month } = TEST_MONTH;
  const fromTs = `${year}-${String(month).padStart(2, "0")}-01 00:00:00`;
  const toTs   = `${year}-${String(month).padStart(2, "0")}-${new Date(year, month, 0).getDate()} 23:59:59`;

  const rows = affiliateIds.map((aff, i) => ({
    source_event_id:             `test-seed-${aff._id}-${year}-${month}`,
    tenant_id:                   tenantId,
    brand_id:                    "test-brand",
    operator_id:                 tenantId,
    from_ts:                     fromTs,
    to_ts:                       toTs,
    granularity:                 "month",
    player_id:                   `test-player-${i}`,
    currency:                    "EUR",
    country:                     "TR",
    affiliate_id:                aff._id,
    affiliate_code:              aff.code,
    campaign:                    "",
    sub_id:                      "",
    registrations:               aff.ftdCount,
    ftd_count:                   aff.ftdCount,
    ftd_sum_cents:               aff.ftdCount * 10000,
    deposits_count:              aff.ftdCount * 2,
    deposits_sum_cents:          Math.abs(aff.ngrCents) + 50_000,
    cashouts_count:              0,
    cashouts_sum_cents:          0,
    chargebacks_count:           0,
    chargebacks_sum_cents:       0,
    bets_sum_cents:              Math.abs(aff.ggrCents) + 100_000,
    wins_sum_cents:              Math.abs(aff.ggrCents),
    casino_bets_rollbacks_sum_cents: 0,
    casino_wins_rollbacks_sum_cents: 0,
    bonus_issues_sum_cents:      aff.ngrCents < 0 ? Math.abs(aff.ngrCents) : 0,
    additional_deductions_sum_cents: 0,
    payment_system_fees_sum_cents:   0,
    jackpot_fees_sum_cents:          0,
    game_provider_fees_sum_cents:    0,
    casino_taxes_sum_cents:          0,
    rounds_count:                aff.ftdCount * 50,
    wager_cents:                 Math.abs(aff.ggrCents) + 100_000,
    casino_ggr_cents:            aff.ggrCents,
    casino_ngr_cents:            aff.ngrCents,
    ggr_mismatch:                0,
    ngr_mismatch:                0,
    is_duplicate:                0,
    is_disabled:                 0,
    is_self_excluded:            0,
    is_verified:                 1,
    source_system:               "test-seeder",
    source_trace_id:             `trace-${i}`,
    source_produced_at:          fromTs,
  }));

  await clickhouse.insert({
    table:  "affiliar.activity_hourly",
    values: rows,
    format: "JSONEachRow",
  });
  console.log(`✓ Inserted ${rows.length} ClickHouse rows for ${year}-${String(month).padStart(2, "0")}`);

  // -- Print expected results --
  console.log("\n" + "─".repeat(72));
  console.log("EXPECTED COMMISSION (verify against /api/commission/reports/calculate)");
  console.log("─".repeat(72));
  console.log(`Period: ${year}-${String(month).padStart(2, "0")}   tenantId: ${tenantId}\n`);

  let grandTotal = 0;
  for (const aff of affiliateIds) {
    const euros = (aff.expected / 100).toFixed(2);
    console.log(`  ${aff.username.padEnd(22)} plan=${aff.plan.padEnd(8)}  expected=€${euros.padStart(8)}  (${aff.expected} cents)`);
    grandTotal += aff.expected;
  }
  console.log("─".repeat(72));
  console.log(`  ${"GRAND TOTAL".padEnd(22)}                    €${(grandTotal / 100).toFixed(2).padStart(8)}`);
  console.log("─".repeat(72));

  console.log("\nNext steps:");
  console.log(`  POST /api/commission/reports/calculate   body: { "year": ${year}, "month": ${month} }`);
  console.log("  GET  /api/commission/reports             → check breakdown per affiliate\n");

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
