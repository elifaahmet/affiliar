"use strict";

const OperatorFinancialSettings = require("../models/OperatorFinancialSettings");
const ProviderFeeRate = require("../models/ProviderFeeRate");

/**
 * On brand creation, snapshot the operator-default financial settings and
 * provider fee rates onto the new brand so:
 *   1. The fees admin UI shows real values (instead of all zeros)
 *      from day one for the new brand.
 *   2. Editing the brand later is an explicit override — the operator
 *      can't accidentally wipe the defaults by saving an unchanged form.
 *
 * Idempotent: if a brand-specific row already exists for any document we
 * touch, we leave it alone. Safe to re-run.
 */
async function cloneOperatorDefaultsForBrand(operatorId, brandId) {
  // ── OperatorFinancialSettings ────────────────────────────────────────────
  const defaultFin = await OperatorFinancialSettings.findOne({
    operatorId,
    brandId: null,
  }).lean();

  if (defaultFin) {
    const existing = await OperatorFinancialSettings.findOne({ operatorId, brandId });
    if (!existing) {
      const { _id, __v, brandId: _bid, createdAt, updatedAt, ...fields } = defaultFin;
      await OperatorFinancialSettings.create({ ...fields, operatorId, brandId });
    }
  }

  // ── ProviderFeeRate (one row per provider) ──────────────────────────────
  const defaultRates = await ProviderFeeRate.find({
    operatorId,
    brandId: null,
    isDeleted: false,
  }).lean();

  if (defaultRates.length) {
    const existingForBrand = await ProviderFeeRate.find({ operatorId, brandId })
      .select({ providerId: 1 })
      .lean();
    const haveProvider = new Set(existingForBrand.map((r) => r.providerId));

    const toCreate = defaultRates
      .filter((r) => !haveProvider.has(r.providerId))
      .map((r) => {
        const { _id, __v, brandId: _bid, createdAt, updatedAt, ...fields } = r;
        return { ...fields, operatorId, brandId };
      });
    if (toCreate.length) {
      await ProviderFeeRate.insertMany(toCreate);
    }
  }
}

module.exports = { cloneOperatorDefaultsForBrand };
