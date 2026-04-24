// End-to-end demo: one affiliate earns separately on casino, sportsbook,
// and combined for the same month, using a realistic event mix.
//
// Flow:
//   1. Use the raw consumer's buildDeltaRow on a stream of realistic raw
//      events (casino bets/wins, sportsbook bets/settlements, bonuses,
//      corrections, deposits). Rows land in a local ClickHouse.
//   2. SummingMergeTree aggregates them. Query the activity view to read
//      casino_ngr / sb_ngr / combined_ngr.
//   3. Feed those into the commission engine three times — once per
//      product slot — using three plans with different rates.
//   4. Print one commission row per product and a grand total.
//
// No Mongo, no HTTP server, no affiliate-be — we mock the parts of the
// controller that talk to persistence. The engine + view are the real
// modules being exercised.

process.env.KAFKA_BROKERS = 'stub:9092';
process.env.CLICKHOUSE_HOST = 'http://localhost:8123';
process.env.CLICKHOUSE_DATABASE = 'affiliate';
process.env.CLICKHOUSE_USERNAME = 'affiliar';
process.env.CLICKHOUSE_PASSWORD = 'affiliar123';
process.env.MONGODB_URI = 'mongodb://stub';
process.env.MONGODB_DATABASE = 'stub';
process.env.HEXORA_MONGODB_URI = 'mongodb://stub';
process.env.HEXORA_MONGODB_DATABASE = 'stub';
// FX off for predictable EUR math.
process.env.FX_BASE_CURRENCY = 'EUR';

const RAW_DIR = '/Users/elifaahmet/projects/pixupPlay/affiliate/affiliate-system/affiliate-raw-kafka-consumer/src';
const BE_DIR  = '/Users/elifaahmet/projects/pixupPlay/affiliate/affiliate-system/affiliate-be';

const { buildDeltaRow } = await import(`${RAW_DIR}/clickhouse.js`);
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const { calculate } = require(`${BE_DIR}/engine/commissionEngine`);

const CH = 'http://localhost:8123';
const AUTH = 'Basic ' + Buffer.from('affiliar:affiliar123').toString('base64');

async function chQuery(sql) {
  const res = await fetch(`${CH}/?default_format=JSON`, {
    method: 'POST', headers: { Authorization: AUTH }, body: sql,
  });
  if (!res.ok) throw new Error(`CH ${res.status}: ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}
async function chInsert(rows) {
  const payload = rows.map((r) => JSON.stringify(r)).join('\n');
  const res = await fetch(
    `${CH}/?query=${encodeURIComponent('INSERT INTO affiliate.activity_hourly_delta FORMAT JSONEachRow')}`,
    { method: 'POST', headers: { Authorization: AUTH }, body: payload },
  );
  if (!res.ok) throw new Error(`CH insert ${res.status}: ${await res.text()}`);
}

// Fixed identifiers
const TENANT = 'tenant-demo';
const BRAND  = 'brand-demo';
const AFF    = 'aff-demo';
const PLAYER = 'player-demo';
const CUR    = 'EUR';
const OCCURRED = '2026-04-24T10:00:00.000Z';

function ev(eventId, type, data, playerId = PLAYER) {
  return {
    eventId,
    eventType: type,
    tenantId:  TENANT,
    brandId:   BRAND,
    playerId,
    currency:  CUR,
    occurredAt: OCCURRED,
    source:    { system: 'demo' },
    data,
  };
}

// Clean
await chQuery(`ALTER TABLE affiliate.activity_hourly_delta DELETE WHERE tenant_id = '${TENANT}'`);
await new Promise((r) => setTimeout(r, 500));

// ── Event stream ────────────────────────────────────────────────────────────
// Casino: €50 bet, €20 win, €10 casino-tagged bonus, €5 deposit fee
// Sportsbook: €30 bet placed, €10 won, €5 sb-tagged bonus
// Generic bonus: €8 (combined-only impact)
// One FTD of €100 to exercise CPA qualification counts
const rawEvents = [
  ev('e1', 'player.registered',       { country: 'DE' }),
  ev('e2', 'wallet.deposit.confirmed', { amountCents: 10000, isFirstDeposit: true, feeCents: 500 }),
  ev('e3', 'casino.bet.placed',       { betCents: 5000, roundId: 'r1' }),
  ev('e4', 'casino.win.settled',      { winCents: 2000, roundId: 'r1' }),
  ev('e5', 'bonus.granted',           { amountCents: 1000, product: 'casino' }),
  ev('e6', 'sportsbook.bet.placed',   { betCents: 3000, betId: 'b1' }),
  ev('e7', 'sportsbook.bet.settled',  { betCents: 3000, winCents: 1000, betId: 'b1', outcome: 'won' }),
  ev('e8', 'bonus.granted',           { amountCents: 500, product: 'sportsbook' }),
  ev('e9', 'bonus.granted',           { amountCents: 800, product: 'generic' }),
];

const rows = rawEvents.map((e) => buildDeltaRow(e, e.data, AFF)).filter(Boolean);
console.log(`→ inserting ${rows.length} delta rows\n`);
await chInsert(rows);

// ── Aggregated read from the view ───────────────────────────────────────────
// Match the commission-engine's expected field names exactly.
const r = (await chQuery(`
  SELECT
    SUM(casino_ggr_cents)   AS casinoGgrCents,
    SUM(casino_ngr_cents)   AS casinoNgrCents,
    SUM(sb_ggr_cents)       AS sbGgrCents,
    SUM(sb_ngr_cents)       AS sbNgrCents,
    SUM(combined_ngr_cents) AS combinedNgrCents,
    SUM(ftd_count)          AS ftdCount
  FROM affiliate.activity WHERE tenant_id = '${TENANT}' FORMAT JSON
`)).data[0];
for (const k of Object.keys(r)) r[k] = Number(r[k]);

const euro = (c) => `€${(c / 100).toFixed(2)}`;

console.log('ClickHouse view rollup');
console.log(`  casino_ggr  = ${euro(r.casinoGgrCents)}    (bet 50 − win 20 = 30)`);
console.log(`  casino_ngr  = ${euro(r.casinoNgrCents)}    (ggr 30 − casino_bonus 10 − deposit_fee 5 = 15)`);
console.log(`  sb_ggr      = ${euro(r.sbGgrCents)}     (sb_bet 30 − sb_win 10 = 20)`);
console.log(`  sb_ngr      = ${euro(r.sbNgrCents)}     (sb_ggr 20 − sb_bonus 5 = 15)`);
console.log(`  combined    = ${euro(r.combinedNgrCents)}     (casino_ngr 15 + sb_ngr 15 − generic_bonus 8 = 22)`);
console.log(`  ftd_count   = ${r.ftdCount}\n`);

// ── Affiliate carries three plan slots ──────────────────────────────────────
const plans = {
  casino:     { type: 'revshare', product: 'casino',     revshare: { rate: 30 }, cpa: { amountCents: 0 } },
  sportsbook: { type: 'revshare', product: 'sportsbook', revshare: { rate: 15 }, cpa: { amountCents: 0 } },
  combined:   { type: 'hybrid',   product: 'combined',
                revshare: { rate: 10 },
                cpa:      { amountCents: 500 } },  // €5 per qualified FTD
};

console.log('Commission per product plan');
let grandTotal = 0;
for (const slot of ['casino', 'sportsbook', 'combined']) {
  const plan = plans[slot];
  const breakdown = calculate(plan, { ...r, qualifiedFtdCount: r.ftdCount });
  const rs = breakdown.revshareAmountCents;
  const cp = breakdown.cpaAmountCents;
  const total = breakdown.totalCents;
  grandTotal += total;
  console.log(
    `  ${slot.padEnd(11)} plan=${plan.type.padEnd(8)} rate=${(plan.revshare?.rate ?? 0)}% → ` +
    `rev ${euro(rs).padStart(7)} + cpa ${euro(cp).padStart(7)} = ${euro(total)}`,
  );
}
console.log(`\n  GRAND TOTAL = ${euro(grandTotal)}\n`);

// Cleanup
await chQuery(`ALTER TABLE affiliate.activity_hourly_delta DELETE WHERE tenant_id = '${TENANT}'`);
