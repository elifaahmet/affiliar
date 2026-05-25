"use strict";

/**
 * Versioned writes + as-of reads for fee configs.
 *
 * Background
 * ----------
 * Fees were stored as a single row per (operator, brand) and every save
 * mutated in place — which meant re-running the feesDailyJob for a past
 * day silently applied today's fees, mutating historical reports.
 *
 * Now each (operator, brand) accumulates a chain of versions: each row
 * has `effectiveFrom` and `effectiveUntil`. The current active row has
 * `effectiveUntil: null`; superseded rows carry the date they were
 * closed. The fees job picks "the version active on day D" so reports
 * stay frozen in time.
 *
 * If the operator deliberately wants to recompute a past day with
 * *current* fees (e.g. they forgot to update before the rate change
 * went live), the manual-run endpoint accepts an `applyCurrentFees`
 * flag that bypasses the as-of lookup.
 */

const OperatorFinancialSettings = require("../models/OperatorFinancialSettings");
const ProviderFeeRate            = require("../models/ProviderFeeRate");

// ── Helpers ──────────────────────────────────────────────────────────────────

// Dot-notation → nested object. Supports `defaults.minKycLevel` style keys
// alongside top-level keys; arrays aren't expected in our fee patches.
function applyDotPatch(target, patch) {
  for (const [key, value] of Object.entries(patch)) {
    if (key.includes(".")) {
      const parts = key.split(".");
      let cursor = target;
      for (let i = 0; i < parts.length - 1; i++) {
        const p = parts[i];
        if (cursor[p] == null || typeof cursor[p] !== "object") cursor[p] = {};
        cursor = cursor[p];
      }
      cursor[parts[parts.length - 1]] = value;
    } else {
      target[key] = value;
    }
  }
  return target;
}

// Strip Mongoose-internal / version-tracking fields so we can clone a row
// into a fresh insert.
function stripMeta(doc) {
  const { _id, __v, createdAt, updatedAt, effectiveFrom, effectiveUntil, ...rest } = doc;
  return rest;
}

// ── OperatorFinancialSettings ────────────────────────────────────────────────

/**
 * Save a new version of an OperatorFinancialSettings row. Merges the patch
 * onto the current active row (so partial updates work), closes the current
 * row's effectiveUntil, then inserts the new row as active.
 *
 * @returns {Promise<OperatorFinancialSettings>} the newly active version
 */
async function saveFinancialsVersion({ operatorId, brandId, patch, asOfDate = new Date() }) {
  const current = await OperatorFinancialSettings.findOne({
    operatorId, brandId, effectiveUntil: null,
  }).lean();

  const base = current ? stripMeta(current) : { operatorId, brandId };
  // Always re-stamp the identity in case stripMeta dropped it for a never-
  // existed row (find returns null → base starts from {operatorId, brandId}).
  base.operatorId = operatorId;
  base.brandId    = brandId;
  applyDotPatch(base, patch);

  if (current) {
    await OperatorFinancialSettings.updateOne(
      { _id: current._id, effectiveUntil: null },
      { $set: { effectiveUntil: asOfDate } },
    );
  }

  const next = await OperatorFinancialSettings.create({
    ...base,
    effectiveFrom: asOfDate,
    effectiveUntil: null,
  });
  return next;
}

/**
 * Returns the OperatorFinancialSettings row that was active on `asOfDate`
 * for the given (operator, brand). Falls back to operator-wide (brandId=null)
 * if no brand-specific row was active at that time.
 */
async function resolveFinancialsAsOf({ operatorId, brandId, asOfDate }) {
  const date = asOfDate instanceof Date ? asOfDate : new Date(asOfDate);

  // Brand-specific first.
  const candidates = await OperatorFinancialSettings.find({
    operatorId,
    brandId,
    effectiveFrom: { $lte: date },
    $or: [{ effectiveUntil: null }, { effectiveUntil: { $gt: date } }],
  })
    .sort({ effectiveFrom: -1 })
    .limit(1)
    .lean();
  if (candidates[0]) return candidates[0];

  // Fall back to operator-wide default if we asked for brand and missed.
  if (brandId != null) {
    return resolveFinancialsAsOf({ operatorId, brandId: null, asOfDate: date });
  }
  return null;
}

// ── ProviderFeeRate ──────────────────────────────────────────────────────────

/**
 * Versioned upsert of a provider rate. Same semantics as
 * saveFinancialsVersion — close the active row, insert a new one.
 * `isDeleted: true` is handled by writing a new version with the flag set
 * (so the rate disappears prospectively without rewriting history).
 */
async function saveProviderRateVersion({
  operatorId, brandId, providerId, providerName, feePercent,
  isDeleted = false, asOfDate = new Date(),
}) {
  const current = await ProviderFeeRate.findOne({
    operatorId, brandId, providerId, effectiveUntil: null,
  }).lean();

  if (current) {
    await ProviderFeeRate.updateOne(
      { _id: current._id, effectiveUntil: null },
      { $set: { effectiveUntil: asOfDate } },
    );
  }

  const next = await ProviderFeeRate.create({
    operatorId,
    brandId,
    providerId,
    providerName: providerName ?? current?.providerName ?? "",
    feePercent,
    isDeleted,
    effectiveFrom: asOfDate,
    effectiveUntil: null,
  });
  return next;
}

/**
 * Returns every provider rate that was active on `asOfDate` for the given
 * operator. Deleted rates are filtered out — soft-delete with versioning
 * means the row at `asOfDate` may legitimately be `isDeleted: true` (the
 * provider was retired before then), and we want to honor that.
 */
async function resolveProviderRatesAsOf({ operatorId, asOfDate }) {
  const date = asOfDate instanceof Date ? asOfDate : new Date(asOfDate);

  // Group by (brandId, providerId), keep the latest version whose window
  // covers `date`. Aggregation framework handles this in one round-trip.
  const rows = await ProviderFeeRate.aggregate([
    {
      $match: {
        operatorId,
        effectiveFrom: { $lte: date },
        $or: [{ effectiveUntil: null }, { effectiveUntil: { $gt: date } }],
      },
    },
    { $sort: { effectiveFrom: -1 } },
    {
      $group: {
        _id: { brandId: "$brandId", providerId: "$providerId" },
        doc: { $first: "$$ROOT" },
      },
    },
    { $replaceRoot: { newRoot: "$doc" } },
    { $match: { isDeleted: { $ne: true } } },
  ]);
  return rows;
}

module.exports = {
  saveFinancialsVersion,
  resolveFinancialsAsOf,
  saveProviderRateVersion,
  resolveProviderRatesAsOf,
};
