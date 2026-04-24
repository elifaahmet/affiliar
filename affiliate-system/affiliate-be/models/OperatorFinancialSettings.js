const mongoose = require("mongoose");

// Operator-level flat-rate settings for fees that aren't provider-specific:
//   - deposit_fees:    % of deposit amounts  (PSP cost on incoming money)
//   - withdrawal_fees: % of cashout amounts  (PSP cost on outgoing money)
//   - jackpot_fees:    % of bets             (jackpot pool contribution)
//   - casino_taxes:    % of GGR              (jurisdiction tax)
//
// The daily fees job reads this once per operator per day and applies each
// rate to the matching base. Rates default to 0, so operators who don't
// configure fees get zero deductions.
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
    depositFeePercent:    { type: Number, default: 0, min: 0, max: 100 },
    withdrawalFeePercent: { type: Number, default: 0, min: 0, max: 100 },
    jackpotFeePercent:    { type: Number, default: 0, min: 0, max: 100 },
    casinoTaxPercent:     { type: Number, default: 0, min: 0, max: 100 },
    // Legacy: pre-split deposit+withdrawal were a single bucket. Readers
    // still honor this for any unmigrated document (treated as deposit fee),
    // but new writes go to depositFeePercent.
    paymentSystemFeePercent: { type: Number, default: null, min: 0, max: 100 },

    // Defaults consumed by the commission engine when a plan leaves the
    // matching field null ("inherit"). Operators can tune these once and
    // have every plan follow — per-plan overrides still work.
    defaults: {
      // Which base drives % revshare calculations.
      //   'ngr' → standard industry practice (GGR minus bonuses, fees, tax)
      //   'ggr' → pre-deduction base (rarer, some B2B deals use it)
      revshareMetric: {
        type: String,
        enum: ["ngr", "ggr"],
        default: "ngr",
      },
      // When NGR is used, whether deposit/withdrawal processor fees are
      // part of the deduction set. Some contracts commit to "gross NGR"
      // (fees carried by the operator outside the rev-share formula).
      ngrIncludesPaymentFees: {
        type: Boolean,
        default: true,
      },
      // For CPA qualification gates (separate PR): whether the deposit
      // amount that counts is gross (face value) or net of processor fees.
      depositBasis: {
        type: String,
        enum: ["gross", "net"],
        default: "gross",
      },
    },
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
