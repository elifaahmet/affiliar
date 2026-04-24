const mongoose = require("mongoose");

/**
 * A commission plan defines how an affiliate earns from player activity.
 *
 * Types:
 *   revshare        — % of NGR or GGR
 *   cpa             — fixed amount per FTD
 *   hybrid          — revshare + cpa simultaneously
 *   tiered_revshare — NGR-band-based variable revshare rate
 *
 * One operator can have many plans; one plan can be the default.
 * Affiliates can be assigned a specific plan via AffiliateProfile.commissionPlanId.
 * If an affiliate has no plan assigned, the operator's default plan is used.
 */
const commissionPlanSchema = new mongoose.Schema(
  {
    operatorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Operator",
      required: true,
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    type: {
      type: String,
      enum: ["revshare", "cpa", "hybrid", "tiered_revshare"],
      required: true,
    },

    // Which NGR base the plan pays on.
    //   casino     — the plan consumes the casino-scoped NGR. Ignores
    //                sportsbook activity entirely.
    //   sportsbook — sportsbook-scoped NGR only.
    //   combined   — casino + sportsbook, minus generic bonuses.
    // Legacy plans default to 'casino' (pre-sportsbook behavior).
    product: {
      type: String,
      enum: ["casino", "sportsbook", "combined"],
      default: "casino",
      index: true,
    },

    // `isDefault` is scoped per-product — an operator can have one default
    // casino plan, one default sb plan, and one default combined plan.
    isDefault: {
      type: Boolean,
      default: false,
      index: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    /**
     * Revenue share config.
     * Used by: revshare, hybrid
     *
     * `metric` and `includePaymentFees` are nullable — null means "inherit
     * from the operator's defaults". Plans that explicitly set 'ngr'/'ggr'
     * or true/false override the operator default.
     */
    revshare: {
      metric: {
        type: String,
        enum: ["ngr", "ggr", null],
        default: null,
      },
      // Percentage 0-100 (e.g. 30 = 30%)
      rate: {
        type: Number,
        min: 0,
        max: 100,
        default: 0,
      },
      // When true, NGR used for commission subtracts deposit/withdrawal/
      // payment_system fees (standard). When false, those fee buckets are
      // added back so the share is taken on "gross NGR". null → inherit.
      includePaymentFees: {
        type: Boolean,
        default: null,
      },
    },

    /**
     * CPA config.
     * Used by: cpa, hybrid
     */
    cpa: {
      // Fixed payout per qualifying FTD, in cents
      amountCents: {
        type: Number,
        default: 0,
        min: 0,
      },
      // Currency for display (e.g. "USD")
      currency: {
        type: String,
        default: "USD",
      },
      // CPA fraud gates. Each field is independently configurable; null
      // means "inherit from operator default". Gates are evaluated at
      // commission-calculation time — FTDs that fail a gate stay in
      // `pending` and may promote on a later recalc once the player
      // accumulates enough activity (or the hold period elapses).
      qualification: {
        // Gross = face-value deposit. Net = deposit after processor fee.
        // null → inherit operator default. Applied to minDepositCents +
        // minWagerMultiple (since multiple is relative to the deposit).
        depositBasis: {
          type: String,
          enum: ["gross", "net", null],
          default: null,
        },
        // Deposit below this amount → FTD rejected outright.
        // (Low-value deposit abuse, prevents €1 FTD → €50 CPA exploit.)
        minDepositCents: { type: Number, default: null, min: 0 },
        // Player must wager at least this many times the deposit amount
        // before the CPA qualifies. Example: 3 → must wager 3× deposit.
        minWagerMultiple: { type: Number, default: null, min: 0 },
        // Flat wager floor — useful when the operator wants a minimum
        // dollar volume independent of deposit size.
        minWagerCents: { type: Number, default: null, min: 0 },
        // Wait period before the CPA qualifies. Gives chargebacks /
        // withdrawals time to surface before affiliate payout.
        holdDays: { type: Number, default: null, min: 0 },
        // Player's net cash position must be at least this much.
        // Measured as deposits − cashouts over the affiliate's lifetime
        // for that player. Catches deposit-then-withdraw fraud.
        minCashRetentionCents: { type: Number, default: null, min: 0 },
      },
    },

    /**
     * Tiered revshare bands.
     * Used by: tiered_revshare
     * Tiers are always applied on NGR (for the whole period).
     * The tier whose [fromCents, toCents) contains the period NGR is applied.
     * toCents: null means "no upper bound".
     *
     * Example:
     *   { fromCents: 0,       toCents: 1000000,  rate: 25 }  // < $10k → 25%
     *   { fromCents: 1000000, toCents: 5000000,  rate: 30 }  // $10k-$50k → 30%
     *   { fromCents: 5000000, toCents: null,      rate: 35 }  // > $50k → 35%
     */
    tiers: [
      {
        fromCents: { type: Number, required: true, min: 0 },
        toCents:   { type: Number, default: null },   // null = unlimited
        rate:      { type: Number, required: true, min: 0, max: 100 },
      },
    ],

    notes: {
      type: String,
      default: null,
    },
  },
  { timestamps: true },
);

commissionPlanSchema.index({ operatorId: 1, isDefault: 1 });
commissionPlanSchema.index({ operatorId: 1, isActive: 1 });

module.exports = mongoose.model("CommissionPlan", commissionPlanSchema);
