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
      unique: true,
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

module.exports = mongoose.model(
  "OperatorFinancialSettings",
  operatorFinancialSettingsSchema,
);
