// Unit tests for the sportsbook events + product-attributed bonus/correction
// routing added in PR2.

process.env.KAFKA_BROKERS = 'stub:9092';
process.env.CLICKHOUSE_HOST = 'http://stub';
process.env.CLICKHOUSE_DATABASE = 'stub';
process.env.CLICKHOUSE_USERNAME = 'stub';
process.env.CLICKHOUSE_PASSWORD = 'stub';
process.env.MONGODB_URI = 'mongodb://stub';
process.env.MONGODB_DATABASE = 'stub';
process.env.HEXORA_MONGODB_URI = 'mongodb://stub';
process.env.HEXORA_MONGODB_DATABASE = 'stub';
process.env.FX_BASE_CURRENCY = 'EUR';

const { buildDeltaRow } = await import('../src/clickhouse.js');
const assert = await import('node:assert/strict');

let passed = 0, failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ok   ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL ${name}\n       ${err.message}`);
    failed++;
  }
}

const baseEvent = (eventType) => ({
  eventId:    `evt-${eventType}`,
  eventType,
  tenantId:   't1',
  brandId:    'b1',
  playerId:   'p1',
  currency:   'EUR',
  occurredAt: '2026-04-24T10:00:00.000Z',
  source:     { system: 'test' },
});

console.log('sportsbook event routing');

test('sportsbook.bet.placed → sb_bets_sum_cents only', () => {
  const row = buildDeltaRow(baseEvent('sportsbook.bet.placed'), { betCents: 5000, betId: 'b1' });
  assert.equal(row.sb_bets_sum_cents, 5000);
  assert.equal(row.bets_sum_cents, 0);
});

test('sportsbook.bet.rejected → sb_rejected_bets_sum_cents', () => {
  const row = buildDeltaRow(baseEvent('sportsbook.bet.rejected'), { betCents: 3000, betId: 'b2' });
  assert.equal(row.sb_rejected_bets_sum_cents, 3000);
  assert.equal(row.sb_bets_sum_cents, 0);
});

test('sportsbook.bet.cancelled → sb_cancelled_bets_sum_cents', () => {
  const row = buildDeltaRow(baseEvent('sportsbook.bet.cancelled'), { betCents: 2000, betId: 'b3' });
  assert.equal(row.sb_cancelled_bets_sum_cents, 2000);
});

test('sportsbook.bet.settled (won) → sb_wins + sb_settled_bets', () => {
  const row = buildDeltaRow(baseEvent('sportsbook.bet.settled'), {
    betCents: 1000, winCents: 2500, betId: 'b4', outcome: 'won',
  });
  assert.equal(row.sb_wins_sum_cents, 2500);
  assert.equal(row.sb_settled_bets_sum_cents, 1000);
});

test('sportsbook.bet.settled (lost) → sb_wins=0 still marks the stake as settled', () => {
  const row = buildDeltaRow(baseEvent('sportsbook.bet.settled'), {
    betCents: 1000, winCents: 0, betId: 'b5', outcome: 'lost',
  });
  assert.equal(row.sb_wins_sum_cents, 0);
  assert.equal(row.sb_settled_bets_sum_cents, 1000);
});

test('sportsbook.win.rollback → sb_win_rollbacks_sum_cents', () => {
  const row = buildDeltaRow(baseEvent('sportsbook.win.rollback'), {
    winCents: 800, betId: 'b6',
  });
  assert.equal(row.sb_win_rollbacks_sum_cents, 800);
});

console.log('bonus product discriminator');

test('bonus.granted untagged → legacy bonus_issues bucket', () => {
  const row = buildDeltaRow(baseEvent('bonus.granted'), { amountCents: 500 });
  assert.equal(row.bonus_issues_sum_cents, 500);
  assert.equal(row.casino_bonus_issues_sum_cents, 0);
  assert.equal(row.sb_bonus_issues_sum_cents, 0);
  assert.equal(row.generic_bonus_issues_sum_cents, 0);
});

test("bonus.granted product='casino' → casino_bonus bucket only", () => {
  const row = buildDeltaRow(baseEvent('bonus.granted'), { amountCents: 500, product: 'casino' });
  assert.equal(row.casino_bonus_issues_sum_cents, 500);
  assert.equal(row.bonus_issues_sum_cents, 0);
});

test("bonus.granted product='sportsbook' → sb_bonus bucket only", () => {
  const row = buildDeltaRow(baseEvent('bonus.granted'), { amountCents: 400, product: 'sportsbook' });
  assert.equal(row.sb_bonus_issues_sum_cents, 400);
  assert.equal(row.bonus_issues_sum_cents, 0);
  assert.equal(row.casino_bonus_issues_sum_cents, 0);
});

test("bonus.granted product='generic' → generic bucket only", () => {
  const row = buildDeltaRow(baseEvent('bonus.granted'), { amountCents: 300, product: 'generic' });
  assert.equal(row.generic_bonus_issues_sum_cents, 300);
  assert.equal(row.bonus_issues_sum_cents, 0);
});

test('bonus.revoked lands in the same bucket as the grant (negative delta)', () => {
  const row = buildDeltaRow(baseEvent('bonus.revoked'), { amountCents: 400, product: 'sportsbook' });
  assert.equal(row.sb_bonus_issues_sum_cents, -400);
});

console.log('correction product routing');

test("correction.down untagged → casino corrections_down", () => {
  const row = buildDeltaRow(baseEvent('wallet.correction.down'), { amountCents: 500 });
  assert.equal(row.corrections_down_sum_cents, 500);
  assert.equal(row.sb_balance_corrections_sum_cents, 0);
});

test("correction.down product='sportsbook' → sb_balance_corrections +amount", () => {
  const row = buildDeltaRow(baseEvent('wallet.correction.down'), { amountCents: 500, product: 'sportsbook' });
  assert.equal(row.sb_balance_corrections_sum_cents, 500);
  assert.equal(row.corrections_down_sum_cents, 0);
});

test("correction.up product='sportsbook' → sb_balance_corrections -amount", () => {
  const row = buildDeltaRow(baseEvent('wallet.correction.up'), { amountCents: 500, product: 'sportsbook' });
  assert.equal(row.sb_balance_corrections_sum_cents, -500);
  assert.equal(row.corrections_up_sum_cents, 0);
});

console.log('fees.daily.adjustment with sportsbook fields');

test('fees.daily.adjustment with sb fields → sb columns populate', () => {
  const row = buildDeltaRow(baseEvent('fees.daily.adjustment'), {
    date: '2026-04-23',
    gameProviderFeesCents: 1000,
    sbThirdPartyFeesCents: 750,
    sbBalanceCorrectionsCents: -200,
  });
  assert.equal(row.game_provider_fees_sum_cents, 1000);
  assert.equal(row.sb_third_party_fees_sum_cents, 750);
  assert.equal(row.sb_balance_corrections_sum_cents, -200);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
