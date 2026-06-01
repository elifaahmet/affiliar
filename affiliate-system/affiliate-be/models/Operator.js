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
      enum: ["trial", "active", "past_due", "suspended", "cancelled"],
      default: "trial",
    },
    // Carved-out operator (e.g. our own Hexora tenant) — the billing job,
    // the past-due gate, and the operator-side billing banner all treat
    // them as if subscription rules don't apply. Set via the admin's
    // operator detail edit panel.
    lifetimeFree: {
      type: Boolean,
      default: false,
    },
    // Sticky discount code: when set, the billing modal pre-fills it on every
    // cycle so a negotiated long-term deal (e.g. €200 fixed-FX flat) re-applies
    // automatically without the operator re-typing each month. Cleared by the
    // operator (or admin) when the deal ends.
    activeDiscountCode: {
      type: String,
      default: "",
      uppercase: true,
      trim: true,
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
      default: () => new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    },
    // When the operator most recently transitioned from `active` to
    // `past_due`. Cleared on successful payment (next cycle starts fresh).
    // Used by the billing reminder job to compute "days overdue" for the
    // suspension-warning copy.
    pastDueAt: {
      type: Date,
      default: null,
    },
    // Affiliate payout policy. The operator pays affiliates via Sans
    // Getirsin (USDT-TRC20); these settings shape what shows up on the
    // "Pending payouts" screen.
    //
    //   minPayoutCents   — affiliates whose accrued approved commission is
    //                      below this threshold are hidden from the
    //                      operator's pending list (still owed; just not
    //                      payable yet). 0 = no threshold.
    //   currency         — display currency for the threshold; actual
    //                      payout always settles in USDT.
    affiliatePayoutSettings: {
      minPayoutCents: { type: Number, default: 0, min: 0 },
      currency:       { type: String, default: "USD" },
    },
    // Append-only log of billing reminder emails sent for the current
    // billing cycle. `cycleAnchor` is the nextBillingDate at the time of
    // send — once the operator pays and nextBillingDate advances, the old
    // entries become irrelevant (the new cycle has its own clean log via
    // the cycleAnchor dedup key).
    //
    // `kind` values:
    //   'upcoming_7d'         — 7 days before due (monthly cycle only)
    //   'upcoming_3d'         — 3 days before due (monthly cycle only)
    //   'due_today'           — day of due date, still unpaid
    //   'past_due_2d'         — +2 days overdue
    //   'past_due_4d'         — +4 days overdue
    //   'suspended'           — +7 days overdue: hard panel cut-off
    billingReminders: {
      type: [
        {
          kind: {
            type: String,
            enum: [
              "upcoming_7d",
              "upcoming_3d",
              "due_today",
              "past_due_2d",
              "past_due_4d",
              "suspended",
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
