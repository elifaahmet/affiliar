const mongoose = require("mongoose");

// Operator-level flat-rate settings for fees that aren't provider-specific:
//   - payment_system_fees: % of deposits (PSP cost)
//   - jackpot_fees:        % of bets   (jackpot pool contribution)
//   - casino_taxes:        % of GGR    (jurisdiction tax)
//
// The daily fees job reads this once per operator per day.
const operatorFinancialSettingsSchema = new mongoose.Schema(
  {
    operatorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Operator",
      required: true,
      index: true,
    },
    // null = operator-wide default; set for a brand-specific override.
    brandId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Brand",
      default: null,
      index: true,
    },
    paymentSystemFeePercent: { type: Number, default: 0, min: 0, max: 100 },
    jackpotFeePercent: { type: Number, default: 0, min: 0, max: 100 },
    casinoTaxPercent: { type: Number, default: 0, min: 0, max: 100 },
    // Base currency for the stored percentages is assumed to match the
    // consumer's FX base; no per-currency override here for MVP.
  },
  { timestamps: true },
);

operatorFinancialSettingsSchema.index(
  { operatorId: 1, brandId: 1 },
  { unique: true },
);

module.exports = mongoose.model(
  "OperatorFinancialSettings",
  operatorFinancialSettingsSchema,
);
