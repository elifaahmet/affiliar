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
    // Sportsbook third-party fees (bookmaker/data-feed costs). Applied
    // to sb_ggr by the daily cron. Can still be overridden via
    // fees.daily.adjustment.sbThirdPartyFeesCents on the raw path.
    sbThirdPartyFeePercent: { type: Number, default: 0, min: 0, max: 100 },
    // Legacy: pre-split deposit+withdrawal were a single bucket. Readers
    // still honor this for any unmigrated document (treated as deposit fee),
    // but new writes go to depositFeePercent.
    paymentSystemFeePercent: { type: Number, default: null, min: 0, max: 100 },

    // Operator-defined extra deductions on top of the canonical fee buckets.
    // Both are folded into additional_deductions_sum_cents by the daily fees
    // job so they reduce NGR through the existing formula.
    //   customNgrFeePercent     — % of combined GGR (casino + sb)
    //   customDepositFeePercent — % of deposits (uses the same fee-attribution
    //                             carve-out as depositFeePercent, so events
    //                             that brought their own feeCents don't get
    //                             charged twice)
    customNgrFeePercent:     { type: Number, default: 0, min: 0, max: 100 },
    customDepositFeePercent: { type: Number, default: 0, min: 0, max: 100 },
    // When true, the daily fees job applies the custom percents regardless of
    // whether the operator also published `additionalDeductionsCents` for the
    // bucket. When false (default), the cron defers to the operator-published
    // value and skips its own custom computation for any bucket that already
    // has a non-zero additional_deductions_sum_cents — avoids double-counting.
    alwaysDeductCustomFees: { type: Boolean, default: false },

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
      // For CPA qualification gates: whether the deposit amount that
      // counts is gross (face value) or net of processor fees.
      depositBasis: {
        type: String,
        enum: ["gross", "net"],
        default: "gross",
      },
      // CPA qualification gate defaults. Each is nullable: null ≡ "gate
      // not enforced by default". Plans can override per-plan to either
      // enable (set a value) or explicitly disable (no plan-level way
      // to force-disable a gate the operator enabled — that's fine, the
      // operator can simply loosen the value).
      minDepositCents:       { type: Number, default: null, min: 0 },
      minWagerMultiple:      { type: Number, default: null, min: 0 },
      minWagerCents:         { type: Number, default: null, min: 0 },
      holdDays:              { type: Number, default: null, min: 0 },
      minCashRetentionCents: { type: Number, default: null, min: 0 },
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
