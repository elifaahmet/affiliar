"use strict";

const { resolveCommissionSettings } = require("./commissionSettings");

/**
 * Pure commission calculation engine.
 * No I/O — takes a plan, metrics, and optional operator defaults; returns a
 * breakdown.
 *
 * All monetary values are in cents (integers).
 * Negative NGR/GGR is clamped to 0 (affiliate never owes money back).
 *
 * `operatorDefaults` is the `defaults` subdoc on OperatorFinancialSettings
 * used to resolve any plan field left null. Passing nothing keeps the old
 * behavior (hard defaults: ngr / includePaymentFees=true / gross).
 */

/**
 * @param {object} plan  CommissionPlan document (or plain object)
 * @param {object} metrics
 *   { ggrCents, ngrCents, ftdCount,
 *     depositFeesCents, withdrawalFeesCents, paymentSystemFeesCents }
 * @param {object} [operatorDefaults]  OperatorFinancialSettings.defaults
 * @returns {{ revshareAmountCents: number, cpaAmountCents: number,
 *            totalCents: number, resolvedSettings: object }}
 */
function calculate(plan, metrics, operatorDefaults = {}) {
  const settings = resolveCommissionSettings(plan, operatorDefaults);

  let revshareAmountCents = 0;
  let cpaAmountCents = 0;

  const { ftdCount = 0 } = metrics;
  const base = computeRevshareBase(metrics, settings);

  switch (plan.type) {
    case "revshare": {
      revshareAmountCents = calcRevshare(plan.revshare, base);
      break;
    }

    case "cpa": {
      cpaAmountCents = calcCpa(plan.cpa, ftdCount);
      break;
    }

    case "hybrid": {
      revshareAmountCents = calcRevshare(plan.revshare, base);
      cpaAmountCents      = calcCpa(plan.cpa, ftdCount);
      break;
    }

    case "tiered_revshare": {
      revshareAmountCents = calcTiered(plan.tiers, base);
      break;
    }

    default:
      throw new Error(`Unknown commission plan type: ${plan.type}`);
  }

  return {
    revshareAmountCents,
    cpaAmountCents,
    totalCents: revshareAmountCents + cpaAmountCents,
    // Expose the resolved settings so controllers can log/store them
    // on the commission report snapshot.
    resolvedSettings: settings,
  };
}

// ── helpers ────────────────────────────────────────────────────────────────────

/**
 * Pick the revshare base (NGR or GGR) per the resolved settings.
 * If includePaymentFees=false, add the processor fee buckets back to NGR so
 * the share is taken on "gross NGR" (GGR minus bonuses/tax/etc but with
 * payment processing cost borne outside the commission formula).
 */
function computeRevshareBase(metrics, settings) {
  const {
    ggrCents = 0,
    ngrCents = 0,
    depositFeesCents = 0,
    withdrawalFeesCents = 0,
    paymentSystemFeesCents = 0,
  } = metrics;

  if (settings.revshareMetric === "ggr") {
    return ggrCents;
  }

  if (!settings.ngrIncludesPaymentFees) {
    return (
      ngrCents +
      depositFeesCents +
      withdrawalFeesCents +
      paymentSystemFeesCents
    );
  }

  return ngrCents;
}

function calcRevshare(revshare, baseCents) {
  const clamped = Math.max(0, baseCents); // never negative
  return Math.floor((clamped * (revshare?.rate || 0)) / 100);
}

function calcCpa(cpa, ftdCount) {
  return Math.max(0, ftdCount) * ((cpa && cpa.amountCents) || 0);
}

function calcTiered(tiers, baseCents) {
  const base = Math.max(0, baseCents);
  if (!Array.isArray(tiers) || tiers.length === 0) return 0;

  // Sort ascending by fromCents so we find the right tier
  const sorted = [...tiers].sort((a, b) => a.fromCents - b.fromCents);
  const tier = sorted.find(
    (t) => base >= t.fromCents && (t.toCents == null || base < t.toCents),
  );
  if (!tier) return 0;
  return Math.floor((base * tier.rate) / 100);
}

module.exports = { calculate, computeRevshareBase };
