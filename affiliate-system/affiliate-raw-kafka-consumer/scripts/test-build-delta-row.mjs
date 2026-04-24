// Standalone unit test for buildDeltaRow, focused on the deposit/withdrawal
// fee-split logic added in the payment-fee rework.
//
// Runs with `node scripts/test-build-delta-row.mjs`. No test framework needed —
// uses node:assert. Prints a small pass/fail report and exits non-zero on any
// failure.

// Provide the env vars config.js demands so the module imports don't throw.
// None of these are actually hit by buildDeltaRow — we just need the file to
// load.
process.env.KAFKA_BROKERS = 'stub:9092';
process.env.CLICKHOUSE_HOST = 'http://stub';
process.env.CLICKHOUSE_DATABASE = 'stub';
process.env.CLICKHOUSE_USERNAME = 'stub';
process.env.CLICKHOUSE_PASSWORD = 'stub';
process.env.MONGODB_URI = 'mongodb://stub';
process.env.MONGODB_DATABASE = 'stub';
process.env.HEXORA_MONGODB_URI = 'mongodb://stub';
process.env.HEXORA_MONGODB_DATABASE = 'stub';
// Disable FX normalization for predictable test output — toBaseCents becomes
// identity.
process.env.FX_BASE_CURRENCY = 'EUR';

const { buildDeltaRow } = await import('../src/clickhouse.js');
const assert = await import('node:assert/strict');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ok   ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL ${name}`);
    console.log(`       ${err.message}`);
    failed++;
  }
}

const baseEvent = {
  eventId:    'evt-test-1',
  eventType:  'wallet.deposit.confirmed',
  tenantId:   't1',
  brandId:    'b1',
  playerId:   'p1',
  currency:   'EUR',
  occurredAt: '2026-04-24T10:30:00.000Z',
  source:     { system: 'test' },
};

console.log('buildDeltaRow — deposit fee paths');

test('deposit without feeCents → fee/attributed cols zeroed, base unchanged', () => {
  const row = buildDeltaRow(
    { ...baseEvent, eventType: 'wallet.deposit.confirmed' },
    { amountCents: 10000, isFirstDeposit: false },
    'aff-1',
  );
  assert.equal(row.deposits_sum_cents, 10000);
  assert.equal(row.deposit_fees_sum_cents, 0);
  assert.equal(row.deposits_fee_attributed_sum_cents, 0);
});

test('deposit with feeCents=250 → fee recorded, attributed = full deposit', () => {
  const row = buildDeltaRow(
    { ...baseEvent, eventType: 'wallet.deposit.confirmed' },
    { amountCents: 10000, isFirstDeposit: false, feeCents: 250 },
    'aff-1',
  );
  assert.equal(row.deposits_sum_cents, 10000);
  assert.equal(row.deposit_fees_sum_cents, 250);
  assert.equal(row.deposits_fee_attributed_sum_cents, 10000);
});

test('deposit with feeCents=0 (explicit zero-fee) → attributed still full deposit', () => {
  // This is the "crypto zero-fee" case: operator says fee is 0, not "unknown".
  // Cron must skip this deposit from rate computation even though fee is 0.
  const row = buildDeltaRow(
    { ...baseEvent, eventType: 'wallet.deposit.confirmed' },
    { amountCents: 10000, isFirstDeposit: false, feeCents: 0 },
    'aff-1',
  );
  assert.equal(row.deposit_fees_sum_cents, 0);
  assert.equal(row.deposits_fee_attributed_sum_cents, 10000);
});

test('FTD deposit with fee → ftd counters also set, fee cols populate', () => {
  const row = buildDeltaRow(
    { ...baseEvent, eventType: 'wallet.deposit.confirmed' },
    { amountCents: 5000, isFirstDeposit: true, feeCents: 125 },
    'aff-1',
  );
  assert.equal(row.ftd_count, 1);
  assert.equal(row.ftd_sum_cents, 5000);
  assert.equal(row.deposit_fees_sum_cents, 125);
  assert.equal(row.deposits_fee_attributed_sum_cents, 5000);
});

console.log('buildDeltaRow — withdrawal fee paths');

test('withdrawal without feeCents → fee/attributed cols zeroed', () => {
  const row = buildDeltaRow(
    { ...baseEvent, eventType: 'wallet.withdrawal.completed' },
    { amountCents: 8000 },
    'aff-1',
  );
  assert.equal(row.cashouts_sum_cents, 8000);
  assert.equal(row.withdrawal_fees_sum_cents, 0);
  assert.equal(row.cashouts_fee_attributed_sum_cents, 0);
});

test('withdrawal with feeCents=150 → fee recorded, attributed = full cashout', () => {
  const row = buildDeltaRow(
    { ...baseEvent, eventType: 'wallet.withdrawal.completed' },
    { amountCents: 8000, feeCents: 150 },
    'aff-1',
  );
  assert.equal(row.cashouts_sum_cents, 8000);
  assert.equal(row.withdrawal_fees_sum_cents, 150);
  assert.equal(row.cashouts_fee_attributed_sum_cents, 8000);
});

console.log('buildDeltaRow — unaffected event types still produce zero for new cols');

test('bet.placed → all fee/attributed cols are zero', () => {
  const row = buildDeltaRow(
    { ...baseEvent, eventType: 'casino.bet.placed' },
    { betCents: 500, roundId: 'r1' },
    'aff-1',
  );
  assert.equal(row.deposit_fees_sum_cents, 0);
  assert.equal(row.withdrawal_fees_sum_cents, 0);
  assert.equal(row.deposits_fee_attributed_sum_cents, 0);
  assert.equal(row.cashouts_fee_attributed_sum_cents, 0);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
