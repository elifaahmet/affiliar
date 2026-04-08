const mongoose = require("mongoose");

/**
 * Canonical operational model for aggregated casino activity.
 * One document per tenant + brand + player + currency + period.
 * Written by either the Kafka consumer or the Activity Import API.
 */
const activityHourlySchema = new mongoose.Schema(
  {
    tenantId:   { type: String, required: true, index: true },
    brandId:    { type: String, required: true, index: true },
    operatorId: { type: String, default: "" },

    from:        { type: Date, required: true },
    to:          { type: Date, required: true },
    granularity: { type: String, enum: ["hour", "day"], required: true },

    playerId:  { type: String, required: true },
    currency:  { type: String, required: true },
    country:   { type: String, default: "" },

    affiliateId:   { type: String, default: "", index: true },
    affiliateCode: { type: String, default: "" },
    campaign:      { type: String, default: "" },
    subId:         { type: String, default: "" },

    metrics: {
      registrations:     { type: Number, default: 0 },
      ftdCount:          { type: Number, default: 0 },
      ftdSumCents:       { type: Number, default: 0 },
      depositsCount:     { type: Number, default: 0 },
      depositsSumCents:  { type: Number, default: 0 },
      cashoutsCount:     { type: Number, default: 0 },
      cashoutsSumCents:  { type: Number, default: 0 },
      chargebacksCount:       { type: Number, default: 0 },
      chargebacksSumCents:    { type: Number, default: 0 },
      betsSumCents:                     { type: Number, default: 0 },
      winsSumCents:                     { type: Number, default: 0 },
      casinoBetsRollbacksSumCents:      { type: Number, default: 0 },
      casinoWinsRollbacksSumCents:      { type: Number, default: 0 },
      bonusIssuesSumCents:              { type: Number, default: 0 },
      additionalDeductionsSumCents:     { type: Number, default: 0 },
      paymentSystemFeesSumCents:        { type: Number, default: 0 },
      jackpotFeesSumCents:              { type: Number, default: 0 },
      gameProviderFeesSumCents:         { type: Number, default: 0 },
      casinoTaxesSumCents:              { type: Number, default: 0 },
      roundsCount: { type: Number, default: 0 },
      wagerCents:  { type: Number, default: 0 },
      // Server-computed derived metrics
      computedGgrCents: { type: Number, default: 0 },
      computedNgrCents: { type: Number, default: 0 },
      ggrMismatch: { type: Boolean, default: false },
      ngrMismatch: { type: Boolean, default: false },
    },

    playerStatuses: {
      isDuplicate:    { type: Boolean, default: false },
      isDisabled:     { type: Boolean, default: false },
      isSelfExcluded: { type: Boolean, default: false },
      isVerified:     { type: Boolean, default: false },
    },

    // Source tracking
    sourceEventId:    { type: String, default: "" },
    sourceSystem:     { type: String, default: "" },
    sourceProducedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'activityHourly' }
);

// Unique business key — one record per player/period/currency
activityHourlySchema.index(
  { tenantId: 1, brandId: 1, from: 1, to: 1, playerId: 1, currency: 1 },
  { unique: true, name: "business_key_unique" }
);

activityHourlySchema.index({ tenantId: 1, affiliateId: 1, from: -1 }, { name: "tenant_affiliate_time" });
activityHourlySchema.index({ tenantId: 1, playerId: 1, from: -1 },    { name: "tenant_player_time" });
activityHourlySchema.index({ tenantId: 1, brandId: 1, from: -1 },     { name: "tenant_brand_time" });

module.exports = mongoose.model("ActivityHourly", activityHourlySchema);
