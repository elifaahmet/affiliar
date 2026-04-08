import { createClient } from '@clickhouse/client';
import { config } from './config.js';

let chClient;

// Pending batch of rows to insert
let batch = [];
let flushTimer = null;

export function connectClickHouse() {
  chClient = createClient({
    url: config.clickhouse.host,
    database: config.clickhouse.database,
    username: config.clickhouse.username,
    password: config.clickhouse.password,
  });

  console.log(`[clickhouse] Client configured for host "${config.clickhouse.host}"`);
}

export async function closeClickHouse() {
  stopFlushTimer();
  await flushBatch();
  if (chClient) {
    await chClient.close();
    console.log('[clickhouse] Client closed');
  }
}

function startFlushTimer() {
  if (flushTimer) return;
  flushTimer = setInterval(async () => {
    try {
      await flushBatch();
    } catch (err) {
      console.error('[clickhouse] Periodic flush error:', err);
    }
  }, config.batch.intervalMs);
}

function stopFlushTimer() {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
}

/**
 * Flatten a processed event into a ClickHouse row and add it to the batch.
 * Flushes automatically when batch reaches the configured size.
 *
 * @param {import('./types.d.ts').AffiliateCasinoActivityAggregatedEvent} event
 * @param {{ computedGgrCents: number, computedNgrCents: number }} derived
 */
export async function addToBatch(event, derived) {
  const row = buildRow(event, derived);
  batch.push(row);

  startFlushTimer();

  if (batch.length >= config.batch.size) {
    await flushBatch();
  }
}

/**
 * Flush all pending rows to ClickHouse.
 */
export async function flushBatch() {
  if (batch.length === 0) return;

  const rows = batch;
  batch = [];

  console.log(`[clickhouse] Flushing ${rows.length} row(s) to activity_hourly table`);

  try {
    await chClient.insert({
      table: 'activity_hourly',
      values: rows,
      format: 'JSONEachRow',
    });
    console.log(`[clickhouse] Successfully inserted ${rows.length} row(s)`);
  } catch (err) {
    console.error('[clickhouse] Insert error:', err);
    throw err;
  }
}

/**
 * Build a flat ClickHouse row from a parsed event + server-computed metrics.
 * All nested objects are flattened; amounts remain as integers (cents).
 *
 * @param {import('./types.d.ts').AffiliateCasinoActivityAggregatedEvent} event
 * @param {{ computedGgrCents: number, computedNgrCents: number }} derived
 */
function toChDateTime(iso) {
  return iso.replace('T', ' ').replace('Z', '').split('.')[0];
}

function buildRow(event, derived) {
  const m = event.metrics;
  const s = event.playerStatuses ?? {};

  return {
    // Identity
    source_event_id:   event.eventId,
    tenant_id:         event.tenantId,
    brand_id:          event.brandId,
    operator_id:       event.operatorId ?? '',

    // Period
    from_ts:           toChDateTime(event.period.from),
    to_ts:             toChDateTime(event.period.to),
    granularity:       event.period.granularity,

    // Player
    player_id:         event.player.playerId,
    currency:          event.player.currency,
    country:           event.player.country ?? '',

    // Affiliate
    affiliate_id:      event.affiliate?.affiliateId ?? '',
    affiliate_code:    event.affiliate?.affiliateCode ?? '',
    campaign:          event.affiliate?.campaign ?? '',
    sub_id:            event.affiliate?.subId ?? '',

    // Registrations & FTD
    registrations:            m.registrations,
    ftd_count:                m.ftdCount,
    ftd_sum_cents:            m.ftdSumCents,

    // Deposits & cashouts
    deposits_count:           m.depositsCount,
    deposits_sum_cents:       m.depositsSumCents,
    cashouts_count:           m.cashoutsCount,
    cashouts_sum_cents:       m.cashoutsSumCents,

    // Chargebacks
    chargebacks_count:        m.chargebacksCount,
    chargebacks_sum_cents:    m.chargebacksSumCents,

    // Bets & wins
    bets_sum_cents:                       m.betsSumCents,
    wins_sum_cents:                       m.winsSumCents,
    casino_bets_rollbacks_sum_cents:      m.casinoBetsRollbacksSumCents,
    casino_wins_rollbacks_sum_cents:      m.casinoWinsRollbacksSumCents,

    // Fee deductions
    bonus_issues_sum_cents:               m.bonusIssuesSumCents,
    additional_deductions_sum_cents:      m.additionalDeductionsSumCents,
    payment_system_fees_sum_cents:        m.paymentSystemFeesSumCents,
    jackpot_fees_sum_cents:               m.jackpotFeesSumCents,
    game_provider_fees_sum_cents:         m.gameProviderFeesSumCents,
    casino_taxes_sum_cents:               m.casinoTaxesSumCents,

    // Engagement
    rounds_count:   m.roundsCount,
    wager_cents:    m.wagerCents,

    // Derived metrics — prefer server-computed values
    casino_ggr_cents: derived.computedGgrCents,
    casino_ngr_cents: derived.computedNgrCents,

    // Mismatch flags for analytics / alerting
    ggr_mismatch: derived.ggrMismatch ? 1 : 0,
    ngr_mismatch: derived.ngrMismatch ? 1 : 0,

    // Player statuses
    is_duplicate:    s.isDuplicate    ? 1 : 0,
    is_disabled:     s.isDisabled     ? 1 : 0,
    is_self_excluded: s.isSelfExcluded ? 1 : 0,
    is_verified:     s.isVerified     ? 1 : 0,

    // Source metadata
    source_system:      event.source.system,
    source_trace_id:    event.source.traceId ?? '',
    source_produced_at: toChDateTime(event.source.producedAt),
  };
}
