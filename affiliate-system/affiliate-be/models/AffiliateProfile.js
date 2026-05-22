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
    // How the parent compensates THIS profile. Set by the parent on their
    // direct child; the operator never touches it. Each parent → child edge
    // has its own subPlan — independent at every level.
    //
    // SHARE-OF-PARENT-COMMISSION model: both rates are a percentage of what
    // the PARENT earns on this sub's subtree (not of raw NGR). The operator
    // pays the chain a commission on the subtree; each edge keeps the bulk
    // and passes its share % down. Since a share can't exceed 100%, a parent
    // can never be paid less than it owes a sub — no negative-balance bug.
    // See engine/subAffiliatePayout.js.
    subPlan: {
      type: {
        type: String,
        enum: ["revshare", "cpa", "hybrid"],
        default: "revshare",
      },
      // % of the parent's REVSHARE commission on this sub's subtree.
      revshareRate:    { type: Number, default: 0, min: 0, max: 100 },
      // % of the parent's CPA commission on this sub's subtree.
      cpaSharePercent: { type: Number, default: 0, min: 0, max: 100 },
      _id: false,
    },
    // DEPRECATED: legacy operator-set override flow, no longer written by
    // the engine. Kept temporarily so old reports' overrideFromSubs entries
    // can still surface in the UI; remove once production is migrated.
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
