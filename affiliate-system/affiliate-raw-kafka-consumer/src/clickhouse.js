import { createClient } from '@clickhouse/client';
import { config } from './config.js';

let chClient;
let rawBatch = [];
let deltaBatch = [];
let flushTimer = null;

export function connectClickHouse() {
  chClient = createClient({
    url: config.clickhouse.host,
    database: config.clickhouse.database,
    username: config.clickhouse.username,
    password: config.clickhouse.password,
  });
  console.log(`[clickhouse] Connected to ${config.clickhouse.host}/${config.clickhouse.database}`);
}

export async function closeClickHouse() {
  stopFlushTimer();
  await flushAll();
  if (chClient) await chClient.close();
}

function startFlushTimer() {
  if (flushTimer) return;
  flushTimer = setInterval(async () => {
    try { await flushAll(); } catch (err) {
      console.error('[clickhouse] Periodic flush error:', err);
    }
  }, config.batch.intervalMs);
}

function stopFlushTimer() {
  if (flushTimer) { clearInterval(flushTimer); flushTimer = null; }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toChDateTime(isoStr) {
  return isoStr.replace('T', ' ').replace('Z', '').split('.')[0];
}

function hourBucket(isoStr) {
  const d = new Date(isoStr);
  d.setMinutes(0, 0, 0);
  return d.toISOString().replace('T', ' ').replace('Z', '').split('.')[0];
}

// ── Build rows ───────────────────────────────────────────────────────────────

function buildRawRow(event) {
  return {
    event_id:      event.eventId,
    event_type:    event.eventType,
    tenant_id:     event.tenantId,
    brand_id:      event.brandId,
    player_id:     event.playerId,
    currency:      event.currency,
    occurred_at:   toChDateTime(event.occurredAt),
    data:          JSON.stringify(event.data || {}),
    source_system: event.source?.system || '',
  };
}

function buildDeltaRow(event, data) {
  const base = {
    tenant_id:       event.tenantId,
    brand_id:        event.brandId,
    player_id:       event.playerId,
    currency:        event.currency,
    hour_bucket:     hourBucket(event.occurredAt),
    source_system:   event.source?.system || '',
    source_event_id: event.eventId,
  };

  const m = {
    registrations: 0, ftd_count: 0, ftd_sum_cents: 0,
    deposits_count: 0, deposits_sum_cents: 0,
    cashouts_count: 0, cashouts_sum_cents: 0,
    chargebacks_count: 0, chargebacks_sum_cents: 0,
    bets_sum_cents: 0, wins_sum_cents: 0,
    casino_bets_rollbacks_sum_cents: 0, casino_wins_rollbacks_sum_cents: 0,
    bonus_issues_sum_cents: 0, additional_deductions_sum_cents: 0,
    payment_system_fees_sum_cents: 0, jackpot_fees_sum_cents: 0,
    game_provider_fees_sum_cents: 0, casino_taxes_sum_cents: 0,
    rounds_count: 0, wager_cents: 0,
  };

  switch (event.eventType) {
    case 'player.registered':
      m.registrations = 1;
      base.country = data.country || '';
      base.affiliate_code = data.affiliateCode || '';
      base.campaign = data.campaign || '';
      base.sub_id = data.subId || '';
      break;
    case 'wallet.deposit.confirmed':
      m.deposits_count = 1;
      m.deposits_sum_cents = data.amountCents;
      if (data.isFirstDeposit) { m.ftd_count = 1; m.ftd_sum_cents = data.amountCents; }
      break;
    case 'wallet.deposit.chargeback':
      m.chargebacks_count = 1; m.chargebacks_sum_cents = data.amountCents;
      break;
    case 'wallet.withdrawal.completed':
      m.cashouts_count = 1; m.cashouts_sum_cents = data.amountCents;
      break;
    case 'casino.bet.placed':
      m.bets_sum_cents = data.betCents; m.wager_cents = data.betCents; m.rounds_count = 1;
      break;
    case 'casino.win.settled':
      m.wins_sum_cents = data.winCents;
      break;
    case 'casino.bet.rollback':
      m.casino_bets_rollbacks_sum_cents = data.betCents;
      break;
    case 'casino.win.rollback':
      m.casino_wins_rollbacks_sum_cents = data.winCents;
      break;
    case 'bonus.granted':
      m.bonus_issues_sum_cents = data.amountCents;
      break;
    case 'fees.daily.adjustment':
      m.payment_system_fees_sum_cents = data.paymentSystemFeesCents || 0;
      m.jackpot_fees_sum_cents = data.jackpotFeesCents || 0;
      m.game_provider_fees_sum_cents = data.gameProviderFeesCents || 0;
      m.casino_taxes_sum_cents = data.casinoTaxesCents || 0;
      m.additional_deductions_sum_cents = data.additionalDeductionsCents || 0;
      break;
    case 'player.flagged':
      return null; // No metric delta
    default:
      return null;
  }

  return { ...base, ...m };
}

// ── Batch + flush ────────────────────────────────────────────────────────────

export function addEvent(event, data) {
  rawBatch.push(buildRawRow(event));
  const delta = buildDeltaRow(event, data);
  if (delta) deltaBatch.push(delta);
  startFlushTimer();
  if (rawBatch.length >= config.batch.size) flushAll();
}

async function flushAll() {
  const raws = rawBatch;
  const deltas = deltaBatch;
  rawBatch = [];
  deltaBatch = [];

  const promises = [];
  if (raws.length > 0) {
    promises.push(
      chClient.insert({ table: 'raw_events', values: raws, format: 'JSONEachRow' })
        .then(() => console.log(`[clickhouse] Flushed ${raws.length} raw_events`))
    );
  }
  if (deltas.length > 0) {
    promises.push(
      chClient.insert({ table: 'activity_hourly_delta', values: deltas, format: 'JSONEachRow' })
        .then(() => console.log(`[clickhouse] Flushed ${deltas.length} activity_hourly_delta`))
    );
  }
  await Promise.all(promises);
}
