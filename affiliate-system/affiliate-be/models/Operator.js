const mongoose = require("mongoose");

const operatorSchema = new mongoose.Schema(
  {
    id: {
      type: Number,
      unique: true,
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    brands: {
      type: [
        {
          id: { type: Number, required: true },
          name: { type: String, required: true, trim: true },
        },
      ],
      default: [],
    },
    plan: {
      type: String,
      enum: ["tier1", "tier2", "plus", "plusL2", "pro"],
      default: "tier1",
    },
    billingStatus: {
      type: String,
      enum: ["trial", "active", "past_due", "cancelled"],
      default: "trial",
    },
    billingCycle: {
      type: Date,
      default: null,
    },
    nextBillingDate: {
      type: Date,
      default: null,
    },
    trialEndsAt: {
      type: Date,
      default: () => new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
    // Per-operator feature flag overrides on top of the subscription plan.
    // Used for bespoke deals — e.g. a custom-priced Crew refer-a-friend
    // engagement that doesn't belong on the public pricing ladder. Keys
    // mirror planLimits.PLANS flags (crewSystem, customFees, kycGate, …);
    // any value here wins over the plan's value via resolveOperatorPlan().
    //
    // Intentionally edited DB-side / by future platform-admin tooling, NOT
    // by the operator themselves — letting an operator self-flip overrides
    // would defeat the gates.
    featureOverrides: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: () => new Map(),
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Operator", operatorSchema);
