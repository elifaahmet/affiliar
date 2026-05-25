const mongoose = require("mongoose");

// Provider-level revenue share that the operator pays out of GGR. Stored
// per (operator, provider) so different providers can have different cuts.
//
// Example: {operatorId: "...", providerId: "coco-gamings", feePercent: 10}
// means the daily fees job books 10% of that provider's GGR as
// game_provider_fees, reducing NGR by that amount.
const providerFeeRateSchema = new mongoose.Schema(
  {
    operatorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Operator",
      required: true,
      index: true,
    },
    // null = operator-wide default (applies to every brand that doesn't
    // have an explicit override). Setting this makes the rate brand-specific.
    brandId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Brand",
      default: null,
      index: true,
    },
    providerId: {
      type: String,
      required: true,
      trim: true,
    },
    providerName: { type: String, default: "" },
    feePercent: { type: Number, required: true, min: 0, max: 100 },
    isDeleted: { type: Boolean, default: false },

    // Temporal versioning — mirrors OperatorFinancialSettings. Each fee
    // change creates a new row; the previous active row gets its
    // effectiveUntil stamped. The fees job picks the right version for
    // each historical day. See models/OperatorFinancialSettings.js for
    // the full rationale.
    effectiveFrom:  { type: Date, default: Date.now, index: true },
    effectiveUntil: { type: Date, default: null, index: true },
  },
  { timestamps: true },
);

// Only one active row per (operator, brand, provider) — historical rows
// have effectiveUntil set and don't compete for uniqueness.
providerFeeRateSchema.index(
  { operatorId: 1, brandId: 1, providerId: 1, effectiveUntil: 1 },
  {
    unique: true,
    partialFilterExpression: { effectiveUntil: null },
    name: "unique_active_per_operator_brand_provider",
  },
);
providerFeeRateSchema.index({
  operatorId: 1, brandId: 1, providerId: 1, effectiveFrom: 1, effectiveUntil: 1,
});

module.exports = mongoose.model("ProviderFeeRate", providerFeeRateSchema);
