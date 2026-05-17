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
  // CPA qualification gates: null ≡ gate disabled. Safe defaults so an
  // operator who has never touched the settings still pays CPA on
  // every FTD the way the product used to work.
  minDepositCents:       null,
  minWagerMultiple:      null,
  minWagerCents:         null,
  holdDays:              null,
  minCashRetentionCents: null,
  minKycLevel:           null,
});

function pick(...values) {
  for (const v of values) {
    if (v !== null && v !== undefined) return v;
  }
  // Everything is null/undefined. Return the last arg explicitly so
  // nullable gates (where the hard default is itself null) resolve to
  // `null` instead of `undefined`.
  return values.length ? values[values.length - 1] : undefined;
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
    // CPA qualification gates. Each resolves independently so operators
    // can enable some gates globally and others per-plan.
    minDepositCents: pick(
      cpaQual.minDepositCents,
      opDefaults.minDepositCents,
      HARD_DEFAULTS.minDepositCents,
    ),
    minWagerMultiple: pick(
      cpaQual.minWagerMultiple,
      opDefaults.minWagerMultiple,
      HARD_DEFAULTS.minWagerMultiple,
    ),
    minWagerCents: pick(
      cpaQual.minWagerCents,
      opDefaults.minWagerCents,
      HARD_DEFAULTS.minWagerCents,
    ),
    holdDays: pick(
      cpaQual.holdDays,
      opDefaults.holdDays,
      HARD_DEFAULTS.holdDays,
    ),
    minCashRetentionCents: pick(
      cpaQual.minCashRetentionCents,
      opDefaults.minCashRetentionCents,
      HARD_DEFAULTS.minCashRetentionCents,
    ),
    minKycLevel: pick(
      cpaQual.minKycLevel,
      opDefaults.minKycLevel,
      HARD_DEFAULTS.minKycLevel,
    ),
  };
}

module.exports = { resolveCommissionSettings, HARD_DEFAULTS };
