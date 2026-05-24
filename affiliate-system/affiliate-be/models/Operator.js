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
    // When the operator most recently transitioned from `active` to
    // `past_due`. Cleared on successful payment (next cycle starts fresh).
    // Used by the billing reminder job to compute "days overdue" for the
    // suspension-warning copy.
    pastDueAt: {
      type: Date,
      default: null,
    },
    // Append-only log of billing reminder emails sent for the current
    // billing cycle. `cycleAnchor` is the nextBillingDate at the time of
    // send — once the operator pays and nextBillingDate advances, the old
    // entries become irrelevant (the new cycle has its own clean log via
    // the cycleAnchor dedup key).
    //
    // `kind` values:
    //   'upcoming_7d'         — 7 days before due
    //   'upcoming_3d'         — 3 days before due
    //   'due_today'           — day of due date, still unpaid
    //   'past_due_daily'      — daily after due, +1..+9 days overdue
    //   'suspension_warning'  — final notice at +10 days overdue
    billingReminders: {
      type: [
        {
          kind: {
            type: String,
            enum: [
              "upcoming_7d",
              "upcoming_3d",
              "due_today",
              "past_due_daily",
              "suspension_warning",
            ],
            required: true,
          },
          cycleAnchor: { type: Date, required: true },
          sentAt:      { type: Date, default: Date.now },
        },
      ],
      default: [],
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
