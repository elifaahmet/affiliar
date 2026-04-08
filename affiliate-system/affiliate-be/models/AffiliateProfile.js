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
    commissionPlanId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CommissionPlan",
      default: null,
      index: true,
    },
    commissionModel: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("AffiliateProfile", affiliateProfileSchema);
