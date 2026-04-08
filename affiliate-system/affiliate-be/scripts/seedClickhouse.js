#!/usr/bin/env node
"use strict";

/**
 * Seed realistic ClickHouse test data for affiliate GYPVCT5M.
 *
 * Inserts daily rows for 10 players across Jan–Apr 2026.
 * Each player FTDs in their first active month, then continues playing.
 *
 * Usage:
 *   node scripts/seedClickhouse.js
 *   node scripts/seedClickhouse.js --dry-run   (print rows, don't insert)
 */

require("dotenv").config();
const { createClient } = require("@clickhouse/client");

const DRY_RUN = process.argv.includes("--dry-run");

// ── Constants ──────────────────────────────────────────────────────────────────

const AFFILIATE_ID   = "69d36a486204e5e7c5b55a8e";
const AFFILIATE_CODE = "GYPVCT5M";
const TENANT_ID      = "69cfab3805fe8a17fd4d736c";
const BRAND_ID       = "1";

// 10 players with different profiles
const PLAYERS = [
  { id: "player_TR_001", currency: "EUR", country: "TR", profile: "whale",      startMonth: 1 },
  { id: "player_TR_002", currency: "EUR", country: "TR", profile: "regular",    startMonth: 1 },
  { id: "player_DE_003", currency: "EUR", country: "DE", profile: "regular",    startMonth: 1 },
  { id: "player_DE_004", currency: "EUR", country: "DE", profile: "casual",     startMonth: 1 },
  { id: "player_TR_005", currency: "EUR", country: "TR", profile: "high_churn", startMonth: 2 },
  { id: "player_TR_006", currency: "EUR", country: "TR", profile: "regular",    startMonth: 2 },
  { id: "player_GB_007", currency: "GBP", country: "GB", profile: "whale",      startMonth: 2 },
  { id: "player_TR_008", currency: "EUR", country: "TR", profile: "casual",     startMonth: 3 },
  { id: "player_DE_009", currency: "EUR", country: "DE", profile: "regular",    startMonth: 3 },
  { id: "player_TR_010", currency: "EUR", country: "TR", profile: "casual",     startMonth: 4 },
];

// Profile definitions (monthly totals in cents)
// high_churn: plays a lot in month 1, then drops off
const PROFILES = {
  whale: {
    bets:     [800_000, 750_000, 900_000, 650_000],
    winRate:  [0.62, 0.58, 0.65, 0.61],
    deposits: [3, 3, 3, 2],
    depSize:  200_000,
    bonus:    [50_000, 40_000, 30_000, 20_000],
  },
  regular: {
    bets:     [150_000, 130_000, 160_000, 120_000],
    winRate:  [0.65, 0.70, 0.63, 0.68],
    deposits: [2, 2, 2, 1],
    depSize:  50_000,
    bonus:    [10_000, 8_000, 8_000, 5_000],
  },
  casual: {
    bets:     [40_000, 30_000, 25_000, 20_000],
    winRate:  [0.72, 0.75, 0.70, 0.78],
    deposits: [1, 1, 1, 1],
    depSize:  20_000,
    bonus:    [5_000, 3_000, 2_000, 1_000],
  },
  high_churn: {
    bets:     [200_000, 20_000, 5_000, 0],
    winRate:  [0.55, 0.70, 0.70, 0],
    deposits: [2, 1, 0, 0],
    depSize:  80_000,
    bonus:    [20_000, 5_000, 0, 0],
  },
};

// ── Date helpers ───────────────────────────────────────────────────────────────

const MONTHS = [
  { year: 2026, month: 1, days: 31, label: "2026-01" },
  { year: 2026, month: 2, days: 28, label: "2026-02" },
  { year: 2026, month: 3, days: 31, label: "2026-03" },
  { year: 2026, month: 4, days: 30, label: "2026-04" },
];

function pad(n) { return String(n).padStart(2, "0"); }

function chTs(year, month, day, endOfDay = false) {
  return `${year}-${pad(month)}-${pad(day)} ${endOfDay ? "23:59:59" : "00:00:00"}`;
}

// ── Row builder ────────────────────────────────────────────────────────────────

let rowCounter = 0;

function buildRow(player, monthDef, monthIndex, dayOfMonth, isFirstDay) {
  const prof       = PROFILES[player.profile];
  const daysInMonth = monthDef.days;

  // Distribute monthly totals across days with some randomness
  const jitter   = () => 0.7 + Math.random() * 0.6;
  const dayShare = (total) => Math.floor((total / daysInMonth) * jitter());

  const bets  = dayShare(prof.bets[monthIndex]);
  const wins  = Math.floor(bets * prof.winRate[monthIndex]);
  const bonus = dayShare(prof.bonus[monthIndex]);
  const providerFee = Math.floor(bets * 0.012);
  const taxes       = Math.floor(bets * 0.005);

  const ggr = bets - wins;
  const ngr = ggr - bonus - providerFee - taxes;

  // FTD only on the very first day the player is active
  const isFtd = isFirstDay && prof.deposits[monthIndex] > 0;
  const ftdSum = isFtd ? prof.depSize : 0;

  // Deposits: split across first few days of month
  const isDepDay   = dayOfMonth <= prof.deposits[monthIndex];
  const depAmount  = isDepDay ? prof.depSize : 0;

  rowCounter++;
  return {
    source_event_id:   `seed-${AFFILIATE_CODE}-${player.id}-${monthDef.label}-${pad(dayOfMonth)}`,
    tenant_id:         TENANT_ID,
    brand_id:          BRAND_ID,
    operator_id:       TENANT_ID,
    from_ts:           chTs(monthDef.year, monthDef.month, dayOfMonth),
    to_ts:             chTs(monthDef.year, monthDef.month, dayOfMonth, true),
    granularity:       "day",
    player_id:         player.id,
    currency:          player.currency,
    country:           player.country,
    affiliate_id:      AFFILIATE_ID,
    affiliate_code:    AFFILIATE_CODE,
    campaign:          "spring_2026",
    sub_id:            "",
    registrations:     isFtd ? 1 : 0,
    ftd_count:         isFtd ? 1 : 0,
    ftd_sum_cents:     ftdSum,
    deposits_count:    isDepDay ? 1 : 0,
    deposits_sum_cents: depAmount,
    cashouts_count:    0,
    cashouts_sum_cents: 0,
    chargebacks_count:  0,
    chargebacks_sum_cents: 0,
    bets_sum_cents:    bets,
    wins_sum_cents:    wins,
    casino_bets_rollbacks_sum_cents: 0,
    casino_wins_rollbacks_sum_cents: 0,
    bonus_issues_sum_cents:          bonus,
    additional_deductions_sum_cents: 0,
    payment_system_fees_sum_cents:   0,
    jackpot_fees_sum_cents:          0,
    game_provider_fees_sum_cents:    providerFee,
    casino_taxes_sum_cents:          taxes,
    rounds_count:      Math.max(0, Math.floor(bets / 500)),
    wager_cents:       bets,
    casino_ggr_cents:  ggr,
    casino_ngr_cents:  ngr,
    ggr_mismatch:      0,
    ngr_mismatch:      0,
    is_duplicate:      0,
    is_disabled:       0,
    is_self_excluded:  0,
    is_verified:       1,
    source_system:     "seed-script",
    source_trace_id:   `seed-${rowCounter}`,
    source_produced_at: chTs(monthDef.year, monthDef.month, dayOfMonth),
  };
}

// ── Build all rows ─────────────────────────────────────────────────────────────

function buildAllRows() {
  const rows = [];

  for (const player of PLAYERS) {
    // monthIndex relative to player's own start
    let playerMonthIndex = 0;

    for (const monthDef of MONTHS) {
      if (monthDef.month < player.startMonth) continue;

      const prof = PROFILES[player.profile];
      // Skip months where player is inactive (bets = 0)
      if (prof.bets[playerMonthIndex] === 0) {
        playerMonthIndex++;
        continue;
      }

      for (let day = 1; day <= monthDef.days; day++) {
        const isFirstDay = day === 1 && playerMonthIndex === 0;
        rows.push(buildRow(player, monthDef, playerMonthIndex, day, isFirstDay));
      }

      playerMonthIndex++;
    }
  }

  return rows;
}

// ── Summary printer ────────────────────────────────────────────────────────────

function printSummary(rows) {
  // Group by month
  const byMonth = {};
  for (const r of rows) {
    const month = r.from_ts.slice(0, 7);
    if (!byMonth[month]) {
      byMonth[month] = { rows: 0, registrations: 0, ftdCount: 0, ftdSumCents: 0,
                         depositsSumCents: 0, ggrCents: 0, ngrCents: 0, players: new Set() };
    }
    const m = byMonth[month];
    m.rows++;
    m.registrations   += r.registrations;
    m.ftdCount        += r.ftd_count;
    m.ftdSumCents     += r.ftd_sum_cents;
    m.depositsSumCents += r.deposits_sum_cents;
    m.ggrCents        += r.casino_ggr_cents;
    m.ngrCents        += r.casino_ngr_cents;
    m.players.add(r.player_id);
  }

  const fmt = (c) => `€${(c / 100).toFixed(2).padStart(10)}`;

  console.log("\n" + "─".repeat(80));
  console.log("EXPECTED DATA SUMMARY (verify against affiliate portal after insert)");
  console.log("─".repeat(80));
  console.log(`Affiliate: ${AFFILIATE_CODE} (${AFFILIATE_ID})`);
  console.log(`Total rows to insert: ${rows.length}\n`);
  console.log(
    "Month      Players  Regs  FTDs  FTD Sum     Deposits    GGR         NGR"
  );
  console.log("─".repeat(80));

  let totRegs = 0, totFtd = 0, totFtdSum = 0, totDep = 0, totGgr = 0, totNgr = 0;
  for (const [month, m] of Object.entries(byMonth).sort()) {
    console.log(
      `${month}   ${String(m.players.size).padStart(4)}     ${String(m.registrations).padStart(4)}  ${String(m.ftdCount).padStart(4)}` +
      `  ${fmt(m.ftdSumCents)}  ${fmt(m.depositsSumCents)}  ${fmt(m.ggrCents)}  ${fmt(m.ngrCents)}`
    );
    totRegs += m.registrations; totFtd += m.ftdCount;
    totFtdSum += m.ftdSumCents; totDep += m.depositsSumCents;
    totGgr += m.ggrCents; totNgr += m.ngrCents;
  }
  console.log("─".repeat(80));
  console.log(
    `TOTAL               ${String(totRegs).padStart(4)}  ${String(totFtd).padStart(4)}` +
    `  ${fmt(totFtdSum)}  ${fmt(totDep)}  ${fmt(totGgr)}  ${fmt(totNgr)}`
  );
  console.log("─".repeat(80) + "\n");
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  const rows = buildAllRows();
  printSummary(rows);

  if (DRY_RUN) {
    console.log("DRY RUN — no data inserted. Remove --dry-run to insert.\n");
    return;
  }

  const ch = createClient({
    url:      process.env.CLICKHOUSE_HOST      || "http://localhost:8123",
    database: process.env.CLICKHOUSE_DATABASE  || "affiliar",
    username: process.env.CLICKHOUSE_USERNAME  || "affiliar",
    password: process.env.CLICKHOUSE_PASSWORD  || "affiliar123",
  });

  // Insert in chunks of 500 to avoid large payloads
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    await ch.insert({
      table:  "affiliar.activity_hourly",
      values: chunk,
      format: "JSONEachRow",
    });
    process.stdout.write(`  Inserted ${Math.min(i + CHUNK, rows.length)}/${rows.length} rows\r`);
  }

  console.log(`\n✓ Done — ${rows.length} rows inserted into affiliar.activity_hourly\n`);
  await ch.close();
}

main().catch((err) => {
  console.error("\nError:", err.message);
  process.exit(1);
});
