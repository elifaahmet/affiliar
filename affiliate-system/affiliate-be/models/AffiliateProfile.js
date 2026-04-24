const mongoose = require("mongoose");

const affiliateProfileSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    affiliateId: {
      type: Number,
      default: null,
      index: true,
    },
    referralCodes: {
      type: [String],
      default: [],
    },
    // Per-brand referral codes — each brand the operator owns gets its own code.
    // Operator must have at least one brand before an affiliate can be created.
    brandCodes: {
      type: [
        {
          code:    { type: String, required: true },
          brandId: { type: mongoose.Schema.Types.ObjectId, ref: "Brand", required: true },
          _id:     false,
        },
      ],
      default: [],
    },
    parentAffiliate: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    // % of sub-affiliate's NGR that flows to their parent as override commission
    // Set by operator per sub. 0 = no override.
    overrideRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    operatorUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    // Legacy — single plan reference. Kept for backward compat. When
    // `commissionPlans` is empty we fall back to this, treating the plan
    // as whichever product its own `product` field says.
    commissionPlanId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CommissionPlan",
      default: null,
      index: true,
    },
    // Per-product plan assignment. Each slot is an optional ref to a
    // CommissionPlan whose `product` matches the slot name. An affiliate
    // can earn on casino + sportsbook separately, or on combined, or any
    // combination — each populated slot produces its own CommissionReport
    // row each period.
    commissionPlans: {
      casino:     { type: mongoose.Schema.Types.ObjectId, ref: "CommissionPlan", default: null },
      sportsbook: { type: mongoose.Schema.Types.ObjectId, ref: "CommissionPlan", default: null },
      combined:   { type: mongoose.Schema.Types.ObjectId, ref: "CommissionPlan", default: null },
    },
    commissionModel: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("AffiliateProfile", affiliateProfileSchema);
