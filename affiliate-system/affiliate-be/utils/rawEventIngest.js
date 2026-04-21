const clickhouse = require("../config/clickhouse");
const { logger } = require("../middlewares/logger");
const AffiliateProfile = require("../models/AffiliateProfile");

async function resolveAffiliateId(code) {
  if (!code) return "";
  const profile = await AffiliateProfile.findOne({
    referralCodes: String(code).trim().toUpperCase(),
  })
    .select({ user: 1 })
    .lean();
  return profile?.user?.toString() || "";
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toChDateTime(isoStr) {
  return isoStr.replace("T", " ").replace("Z", "").split(".")[0];
}

function hourBucket(isoStr) {
  const d = new Date(isoStr);
  d.setMinutes(0, 0, 0);
  return d.toISOString().replace("T", " ").replace("Z", "").split(".")[0];
}

// ── Log raw event ────────────────────────────────────────────────────────────

async function logRawEvent(event) {
  try {
    await clickhouse.insert({
      table: "raw_events",
      values: [
        {
          event_id:      event.eventId,
          event_type:    event.eventType,
          tenant_id:     event.tenantId,
          brand_id:      event.brandId,
          player_id:     event.playerId,
          currency:      event.currency,
          occurred_at:   toChDateTime(event.occurredAt),
          data:          JSON.stringify(event.data || {}),
          source_system: event.source?.system || "",
        },
      ],
      format: "JSONEachRow",
    });
  } catch (err) {
    logger.error("rawEvent.logFailed", { eventId: event.eventId, error: err.message });
  }
}

// ── Build delta row ──────────────────────────────────────────────────────────
// Each raw event produces exactly one delta row for activity_hourly_delta.
// SummingMergeTree will sum these deltas per (tenant, brand, player, currency, hour).

function buildDeltaRow(event, data, affiliateId = "") {
  const base = {
    tenant_id:      event.tenantId,
    brand_id:       event.brandId,
    player_id:      event.playerId,
    currency:       event.currency,
    hour_bucket:    hourBucket(event.occurredAt),
    source_system:  event.source?.system || "",
    source_event_id: event.eventId,
    affiliate_id:   affiliateId || "",
  };

  // All metrics default to 0 — only set the delta for this specific event type
  const metrics = {
    registrations: 0,
    ftd_count: 0,
    ftd_sum_cents: 0,
    deposits_count: 0,
    deposits_sum_cents: 0,
    cashouts_count: 0,
    cashouts_sum_cents: 0,
    chargebacks_count: 0,
    chargebacks_sum_cents: 0,
    bets_sum_cents: 0,
    wins_sum_cents: 0,
    casino_bets_rollbacks_sum_cents: 0,
    casino_wins_rollbacks_sum_cents: 0,
    bonus_issues_sum_cents: 0,
    additional_deductions_sum_cents: 0,
    payment_system_fees_sum_cents: 0,
    jackpot_fees_sum_cents: 0,
    game_provider_fees_sum_cents: 0,
    casino_taxes_sum_cents: 0,
    rounds_count: 0,
    wager_cents: 0,
  };

  switch (event.eventType) {
    case "player.registered":
      metrics.registrations = 1;
      base.country = data.country || "";
      base.affiliate_code = data.affiliateCode || "";
      base.campaign = data.campaign || "";
      base.sub_id = data.subId || "";
      break;

    case "wallet.deposit.confirmed":
      metrics.deposits_count = 1;
      metrics.deposits_sum_cents = data.amountCents;
      if (data.isFirstDeposit) {
        metrics.ftd_count = 1;
        metrics.ftd_sum_cents = data.amountCents;
      }
      break;

    case "wallet.deposit.chargeback":
      metrics.chargebacks_count = 1;
      metrics.chargebacks_sum_cents = data.amountCents;
      break;

    case "wallet.withdrawal.completed":
      metrics.cashouts_count = 1;
      metrics.cashouts_sum_cents = data.amountCents;
      break;

    case "casino.bet.placed":
      metrics.bets_sum_cents = data.betCents;
      metrics.wager_cents = data.betCents;
      metrics.rounds_count = 1;
      break;

    case "casino.win.settled":
      metrics.wins_sum_cents = data.winCents;
      break;

    case "casino.bet.rollback":
      metrics.casino_bets_rollbacks_sum_cents = data.betCents;
      break;

    case "casino.win.rollback":
      metrics.casino_wins_rollbacks_sum_cents = data.winCents;
      break;

    case "bonus.granted":
      metrics.bonus_issues_sum_cents = data.amountCents;
      break;

    case "bonus.revoked":
      // Reverses a grant when a bonus expires or is cancelled before use.
      metrics.bonus_issues_sum_cents = -data.amountCents;
      break;

    case "fees.daily.adjustment":
      metrics.payment_system_fees_sum_cents = data.paymentSystemFeesCents || 0;
      metrics.jackpot_fees_sum_cents = data.jackpotFeesCents || 0;
      metrics.game_provider_fees_sum_cents = data.gameProviderFeesCents || 0;
      metrics.casino_taxes_sum_cents = data.casinoTaxesCents || 0;
      metrics.additional_deductions_sum_cents = data.additionalDeductionsCents || 0;
      break;

    case "player.flagged":
      // Flagged events don't produce metric deltas — handled separately if needed
      return null;

    default:
      return null;
  }

  return { ...base, ...metrics };
}

// ── Insert delta ─────────────────────────────────────────────────────────────

async function insertDelta(event, data, affiliateId) {
  const row = buildDeltaRow(event, data, affiliateId);
  if (!row) return;

  try {
    await clickhouse.insert({
      table: "activity_hourly_delta",
      values: [row],
      format: "JSONEachRow",
    });
    logger.info("rawEvent.deltaInserted", {
      eventId: event.eventId,
      eventType: event.eventType,
      playerId: event.playerId,
    });
  } catch (err) {
    logger.error("rawEvent.deltaFailed", {
      eventId: event.eventId,
      error: err.message,
    });
    throw err;
  }
}

// ── Main ingest function ─────────────────────────────────────────────────────
// Used by both REST endpoint and Kafka consumer

async function ingestRawEvent(event, data) {
  const affiliateId = await resolveAffiliateId(data.affiliateCode);
  await Promise.all([
    logRawEvent(event),
    insertDelta(event, data, affiliateId),
  ]);
}

module.exports = { ingestRawEvent, buildDeltaRow };
