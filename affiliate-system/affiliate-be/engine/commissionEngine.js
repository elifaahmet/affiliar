"use strict";

/**
 * Pure commission calculation engine.
 * No I/O — takes a plan and metrics, returns a breakdown.
 *
 * All monetary values are in cents (integers).
 * Negative NGR/GGR is clamped to 0 (affiliate never owes money back).
 */

/**
 * @param {object} plan  CommissionPlan document (or plain object)
 * @param {object} metrics
 *   { ggrCents, ngrCents, ftdCount, depositsCount, depositsCents, playerCount }
 * @returns {{ revshareAmountCents: number, cpaAmountCents: number, totalCents: number }}
 */
function calculate(plan, metrics) {
  let revshareAmountCents = 0;
  let cpaAmountCents = 0;

  const { ggrCents = 0, ngrCents = 0, ftdCount = 0 } = metrics;

  switch (plan.type) {
    case "revshare": {
      revshareAmountCents = calcRevshare(plan.revshare, ggrCents, ngrCents);
      break;
    }

    case "cpa": {
      cpaAmountCents = calcCpa(plan.cpa, ftdCount);
      break;
    }

    case "hybrid": {
      revshareAmountCents = calcRevshare(plan.revshare, ggrCents, ngrCents);
      cpaAmountCents      = calcCpa(plan.cpa, ftdCount);
      break;
    }

    case "tiered_revshare": {
      revshareAmountCents = calcTiered(plan.tiers, ngrCents);
      break;
    }

    default:
      throw new Error(`Unknown commission plan type: ${plan.type}`);
  }

  return {
    revshareAmountCents,
    cpaAmountCents,
    totalCents: revshareAmountCents + cpaAmountCents,
  };
}

// ── helpers ────────────────────────────────────────────────────────────────────

function calcRevshare(revshare, ggrCents, ngrCents) {
  const base = revshare.metric === "ggr" ? ggrCents : ngrCents;
  const clamped = Math.max(0, base); // never negative
  return Math.floor((clamped * revshare.rate) / 100);
}

function calcCpa(cpa, ftdCount) {
  return Math.max(0, ftdCount) * (cpa.amountCents || 0);
}

function calcTiered(tiers, ngrCents) {
  const base = Math.max(0, ngrCents);
  if (!Array.isArray(tiers) || tiers.length === 0) return 0;

  // Sort ascending by fromCents so we find the right tier
  const sorted = [...tiers].sort((a, b) => a.fromCents - b.fromCents);
  const tier = sorted.find(
    (t) => base >= t.fromCents && (t.toCents == null || base < t.toCents),
  );
  if (!tier) return 0;
  return Math.floor((base * tier.rate) / 100);
}

module.exports = { calculate };
