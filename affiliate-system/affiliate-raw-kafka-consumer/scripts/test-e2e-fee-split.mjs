// End-to-end smoke test for the deposit/withdrawal fee split.
//
//   1. Builds delta rows via buildDeltaRow for 3 deposits — one with feeCents,
//      one with feeCents=0 (explicit zero-fee), one without feeCents — plus
//      a withdrawal with feeCents and one without.
//   2. Inserts them directly into affiliate.activity_hourly_delta.
//   3. Queries the bucket's totals to confirm the attributed sums landed.
//   4. Invokes computeFeesForBucket with a 3% deposit / 2% withdrawal rate
//      and asserts the rate-base excludes the attributed amounts so there's
//      no double-counting.

process.env.KAFKA_BROKERS = 'stub:9092';
process.env.CLICKHOUSE_HOST = 'http://localhost:8123';
process.env.CLICKHOUSE_DATABASE = 'affiliate';
process.env.CLICKHOUSE_USERNAME = 'affiliar';
process.env.CLICKHOUSE_PASSWORD = 'affiliar123';
process.env.MONGODB_URI = 'mongodb://stub';
process.env.MONGODB_DATABASE = 'stub';
process.env.HEXORA_MONGODB_URI = 'mongodb://stub';
process.env.HEXORA_MONGODB_DATABASE = 'stub';
process.env.FX_BASE_CURRENCY = 'EUR';

const { buildDeltaRow } = await import('../src/clickhouse.js');
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const { computeFeesForBucket } = require('../../affiliate-be/jobs/computeFees');

const CH = 'http://localhost:8123';
const AUTH = 'Basic ' + Buffer.from('affiliar:affiliar123').toString('base64');

async function chQuery(sql) {
  const res = await fetch(`${CH}/?default_format=JSON`, {
    method: 'POST',
    headers: { Authorization: AUTH, 'Content-Type': 'text/plain' },
    body: sql,
  });
  if (!res.ok) throw new Error(`CH ${res.status}: ${await res.text()}`);
  const text = await res.text();
  if (!text) return null;
  return JSON.parse(text);
}

async function chInsert(rows) {
  const payload = rows.map((r) => JSON.stringify(r)).join('\n');
  const res = await fetch(
    `${CH}/?query=${encodeURIComponent('INSERT INTO affiliate.activity_hourly_delta FORMAT JSONEachRow')}`,
    {
      method: 'POST',
      headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
      body: payload,
    },
  );
  if (!res.ok) throw new Error(`CH insert ${res.status}: ${await res.text()}`);
}

const TENANT = 'tenant-e2e';
const BRAND = 'brand-e2e';
const AFFILIATE = 'aff-e2e';
const CURRENCY = 'EUR';
const HOUR_ISO = '2026-04-24T09:00:00.000Z';

// Clean any prior run.
await chQuery(
  `ALTER TABLE affiliate.activity_hourly_delta DELETE WHERE tenant_id = '${TENANT}'`,
);
// DELETE is async; give it a moment before inserting fresh data.
await new Promise((r) => setTimeout(r, 500));

function event(eventId, type, data) {
  return {
    eventId,
    eventType: type,
    tenantId:  TENANT,
    brandId:   BRAND,
    playerId:  'player-e2e',
    currency:  CURRENCY,
    occurredAt: HOUR_ISO,
    source:    { system: 'test' },
    data,
  };
}

const rows = [
  buildDeltaRow(
    event('dep-1', 'wallet.deposit.confirmed'),
    { amountCents: 10000, isFirstDeposit: true, feeCents: 250 },
    AFFILIATE,
  ),
  buildDeltaRow(
    event('dep-2', 'wallet.deposit.confirmed'),
    { amountCents: 5000, isFirstDeposit: false, feeCents: 0 },
    AFFILIATE,
  ),
  buildDeltaRow(
    event('dep-3', 'wallet.deposit.confirmed'),
    { amountCents: 8000, isFirstDeposit: false }, // no feeCents → rate-path
    AFFILIATE,
  ),
  buildDeltaRow(
    event('wd-1', 'wallet.withdrawal.completed'),
    { amountCents: 4000, feeCents: 100 },
    AFFILIATE,
  ),
  buildDeltaRow(
    event('wd-2', 'wallet.withdrawal.completed'),
    { amountCents: 3000 }, // no feeCents → rate-path
    AFFILIATE,
  ),
];

console.log(`Inserting ${rows.length} rows...`);
await chInsert(rows);

const agg = await chQuery(`
  SELECT
    SUM(deposits_sum_cents)                     AS deposits,
    SUM(cashouts_sum_cents)                     AS cashouts,
    SUM(deposit_fees_sum_cents)                 AS depositFees,
    SUM(withdrawal_fees_sum_cents)              AS withdrawalFees,
    SUM(deposits_fee_attributed_sum_cents)      AS depositsAttr,
    SUM(cashouts_fee_attributed_sum_cents)      AS cashoutsAttr
  FROM affiliate.activity_hourly_delta
  WHERE tenant_id = '${TENANT}'
  FORMAT JSON
`);
const b = agg.data[0];
for (const k of Object.keys(b)) b[k] = Number(b[k]);
console.log('Bucket totals from ClickHouse:', b);

const assert = await import('node:assert/strict');

// Expected totals:
// deposits:        10000 + 5000 + 8000 = 23000
// cashouts:        4000 + 3000        = 7000
// depositFees:     250 + 0 (from feeCents) = 250
// withdrawalFees:  100
// depositsAttr:    10000 + 5000 = 15000  (dep-1 & dep-2 had feeCents)
// cashoutsAttr:    4000                  (wd-1 had feeCents)

let passed = 0, failed = 0;
function check(label, actual, expected) {
  try {
    assert.equal(actual, expected);
    console.log(`  ok   ${label} → ${actual}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL ${label} → got ${actual}, expected ${expected}`);
    failed++;
  }
}

console.log('\nBucket totals assertions');
check('deposits_sum = 23000',            b.deposits,       23000);
check('cashouts_sum = 7000',             b.cashouts,        7000);
check('deposit_fees_sum = 250',          b.depositFees,      250);
check('withdrawal_fees_sum = 100',       b.withdrawalFees,   100);
check('deposits_attributed = 15000',     b.depositsAttr,   15000);
check('cashouts_attributed = 4000',      b.cashoutsAttr,    4000);

// Now run the cron formula against this bucket.
// With 3% deposit / 2% withdrawal rates:
//   rateBase (deposits) = 23000 - 15000 = 8000 → 240
//   rateBase (cashouts) =  7000 -  4000 = 3000 →  60
const cronOut = computeFeesForBucket(
  {
    bets: 0, wins: 0,
    deposits: b.deposits,
    cashouts: b.cashouts,
    depositsFeeAttributed: b.depositsAttr,
    cashoutsFeeAttributed: b.cashoutsAttr,
  },
  { depositFeePercent: 3, withdrawalFeePercent: 2 },
);
console.log('\ncron output:', cronOut);

console.log('\ncron partial-mix assertions');
check('deposit rate applied only to unattributed (8000 × 3% = 240)', cronOut.depositFees,    240);
check('withdrawal rate applied only to unattributed (3000 × 2% = 60)', cronOut.withdrawalFees, 60);

// Event-supplied fees + cron-computed fees together in NGR formula
// should give the combined processor cost:
//   250 (event) + 240 (rate) = 490 for deposits
//   100 (event) +  60 (rate) = 160 for withdrawals
const totalDepositCost = b.depositFees + cronOut.depositFees;
const totalWithdrawalCost = b.withdrawalFees + cronOut.withdrawalFees;
check('total deposit fee across both paths = 490',    totalDepositCost,    490);
check('total withdrawal fee across both paths = 160', totalWithdrawalCost, 160);

// Cleanup.
await chQuery(
  `ALTER TABLE affiliate.activity_hourly_delta DELETE WHERE tenant_id = '${TENANT}'`,
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
