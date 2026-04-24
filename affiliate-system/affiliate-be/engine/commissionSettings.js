"use strict";

/**
 * Resolve commission-related settings for a specific plan, merging plan-level
 * overrides with the operator's defaults and system hard defaults.
 *
 * Priority (first non-null wins):
 *   1. plan field (explicit operator override for this plan)
 *   2. operator defaults (set once in OperatorFinancialSettings)
 *   3. system hard defaults (safe for all tenants)
 *
 * Keeping this as a pure function makes the engine testable and avoids
 * duplicating the merge logic in every caller (commission calc, FE
 * preview, CPA qualification gates in the next PR).
 */

const HARD_DEFAULTS = Object.freeze({
  revshareMetric: "ngr",
  ngrIncludesPaymentFees: true,
  depositBasis: "gross",
});

function pick(...values) {
  for (const v of values) {
    if (v !== null && v !== undefined) return v;
  }
  return undefined;
}

function resolveCommissionSettings(plan, operatorDefaults) {
  const p = plan || {};
  const opDefaults = operatorDefaults || {};
  const revshare = p.revshare || {};
  const cpaQual = (p.cpa && p.cpa.qualification) || {};

  return {
    revshareMetric: pick(
      revshare.metric,
      opDefaults.revshareMetric,
      HARD_DEFAULTS.revshareMetric,
    ),
    ngrIncludesPaymentFees: pick(
      revshare.includePaymentFees,
      opDefaults.ngrIncludesPaymentFees,
      HARD_DEFAULTS.ngrIncludesPaymentFees,
    ),
    depositBasis: pick(
      cpaQual.depositBasis,
      opDefaults.depositBasis,
      HARD_DEFAULTS.depositBasis,
    ),
  };
}

module.exports = { resolveCommissionSettings, HARD_DEFAULTS };
