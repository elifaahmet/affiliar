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
      // Qualification rules consumed by a future PR (CPA fraud gates).
      // Stored now so the FE form can capture operator intent.
      qualification: {
        // Gross = face-value deposit. Net = deposit after processor fee.
        // null → inherit operator default.
        depositBasis: {
          type: String,
          enum: ["gross", "net", null],
          default: null,
        },
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
