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
 *     qualifiedFtdCount?,   // from CPA qualification step; falls back to ftdCount
 *     depositFeesCents, withdrawalFeesCents, paymentSystemFeesCents }
 * @param {object} [operatorDefaults]  OperatorFinancialSettings.defaults
 * @returns {{ revshareAmountCents: number, cpaAmountCents: number,
 *            totalCents: number, resolvedSettings: object }}
 *
 * If any CPA qualification gate is active, pass `qualifiedFtdCount` —
 * only those FTDs generate CPA. Without it we fall back to the raw
 * `ftdCount` (preserves old behavior for callers that don't gate).
 */
function calculate(plan, metrics, operatorDefaults = {}) {
  const settings = resolveCommissionSettings(plan, operatorDefaults);

  let revshareAmountCents = 0;
  let cpaAmountCents = 0;
  let fixedAmountCents = 0;

  // Negative carryover: when enabled on the plan, a prior period's unrecovered
  // NGR deficit (carryInCents, ≤ 0) is netted against this period's revshare
  // base before the share is taken. Any deficit that remains (still ≤ 0) is
  // returned as carryOutCents to carry into the next period. Disabled by
  // default → carryIn forced to 0, so behaviour is identical to flooring at 0.
  const carryInCents = plan.negativeCarryover
    ? Math.min(0, Number(metrics.carryInCents) || 0)
    : 0;
  let carryOutCents = 0;

  // Prefer the qualified count when the caller has already run gates.
  const ftdCountForCpa =
    metrics.qualifiedFtdCount !== undefined
      ? metrics.qualifiedFtdCount
      : metrics.ftdCount || 0;

  // For fixed plans the controller pre-counts players who newly crossed
  // every gate this period and passes them in as `newlyQualifiedPlayerCount`.
  // Engine just multiplies — gate evaluation lives in the controller
  // because it needs DB access (player lifetime context + prior-paid lookup).
  const fixedQualifiedCount = metrics.newlyQualifiedPlayerCount || 0;

  const base = computeRevshareBase(metrics, settings, plan);
  // Net the carried deficit against this period's base (carryIn ≤ 0).
  const effectiveBase = base + carryInCents;

  switch (plan.type) {
    case "revshare": {
      revshareAmountCents = calcRevshare(plan.revshare, effectiveBase);
      carryOutCents = Math.min(0, effectiveBase);
      break;
    }

    case "cpa": {
      cpaAmountCents = calcCpa(plan.cpa, ftdCountForCpa);
      break;
    }

    case "hybrid": {
      revshareAmountCents = calcRevshare(plan.revshare, effectiveBase);
      cpaAmountCents      = calcCpa(plan.cpa, ftdCountForCpa);
      carryOutCents = Math.min(0, effectiveBase);
      break;
    }

    case "tiered_revshare": {
      revshareAmountCents = calcTiered(plan.tiers, effectiveBase);
      carryOutCents = Math.min(0, effectiveBase);
      break;
    }

    case "fixed": {
      const amount = Number(plan.fixed?.amountCents) || 0;
      fixedAmountCents = amount * fixedQualifiedCount;
      break;
    }

    default:
      throw new Error(`Unknown commission plan type: ${plan.type}`);
  }

  return {
    revshareAmountCents,
    cpaAmountCents,
    fixedAmountCents,
    // Carryover audit: what we netted in, and what rolls to next period.
    // Both 0 unless the plan opts into negative carryover.
    carryInCents,
    carryOutCents: plan.negativeCarryover ? carryOutCents : 0,
    totalCents: revshareAmountCents + cpaAmountCents + fixedAmountCents,
    // Expose the resolved settings so controllers can log/store them
    // on the commission report snapshot.
    resolvedSettings: settings,
  };
}

// ── helpers ────────────────────────────────────────────────────────────────────

/**
 * Pick the revshare base (NGR or GGR) per the resolved settings and the
 * plan's product scope.
 *
 * For NGR-based plans, we look up `metrics.{product}NgrCents` first
 * (casinoNgrCents / sbNgrCents / combinedNgrCents), then fall back to the
 * legacy `metrics.ngrCents` if the caller still uses the pre-sportsbook
 * shape. GGR follows the same pattern with `{product}GgrCents`.
 *
 * If includePaymentFees=false, add the processor fee buckets back to NGR so
 * the share is taken on "gross NGR" (GGR minus bonuses/tax/etc but with
 * payment processing cost borne outside the commission formula).
 */
function computeRevshareBase(metrics, settings, plan = {}) {
  const product = plan.product || "casino";
  const {
    ngrCents = 0,
    ggrCents = 0,
    casinoNgrCents, casinoGgrCents,
    sbNgrCents, sbGgrCents,
    combinedNgrCents,
    depositFeesCents = 0,
    withdrawalFeesCents = 0,
    paymentSystemFeesCents = 0,
  } = metrics;

  // Product-scoped base lookup. Fall through to the legacy field when
  // the caller hasn't started passing the product-specific keys yet.
  const pickNgr = () => {
    if (product === "sportsbook" && sbNgrCents !== undefined) return sbNgrCents;
    if (product === "combined"   && combinedNgrCents !== undefined) return combinedNgrCents;
    if (product === "casino"     && casinoNgrCents !== undefined) return casinoNgrCents;
    return ngrCents;
  };
  const pickGgr = () => {
    if (product === "sportsbook" && sbGgrCents !== undefined) return sbGgrCents;
    if (product === "casino"     && casinoGgrCents !== undefined) return casinoGgrCents;
    // Combined GGR isn't stored as its own field today — approximate as
    // casino + sb, else fall back to legacy ggrCents.
    if (product === "combined" && casinoGgrCents !== undefined && sbGgrCents !== undefined) {
      return casinoGgrCents + sbGgrCents;
    }
    return ggrCents;
  };

  if (settings.revshareMetric === "ggr") {
    return pickGgr();
  }

  const baseNgr = pickNgr();

  if (!settings.ngrIncludesPaymentFees) {
    // Only casino/combined NGR had wallet-shared fees subtracted in the
    // view. sb_ngr doesn't include them, so the add-back is a no-op for
    // sportsbook plans — but we still run the math uniformly.
    return (
      baseNgr +
      depositFeesCents +
      withdrawalFeesCents +
      paymentSystemFeesCents
    );
  }

  return baseNgr;
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
