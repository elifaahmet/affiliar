const mongoose = require("mongoose");

/**
 * One commission report per affiliate per month.
 * Created/recalculated via POST /commission/reports/calculate.
 * Workflow: draft → pending_approval → approved → paid
 *
 * Recalculating an existing draft/pending report overwrites it.
 * Approved/paid reports cannot be recalculated (must be manually reset).
 */
const commissionReportSchema = new mongoose.Schema(
  {
    operatorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Operator",
      required: true,
      index: true,
    },

    affiliateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    affiliateCode: {
      type: String,
      default: null,
    },

    // The plan used — stored as a reference + snapshot so history is preserved
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CommissionPlan",
      default: null,
    },
    planSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    period: {
      year:  { type: Number, required: true },
      month: { type: Number, required: true, min: 1, max: 12 }, // 1-12
    },

    // Which NGR base this report was calculated on. Mirrors the plan's
    // `product`. Pre-sportsbook reports default to 'casino' — safe because
    // sb_ngr was 0 for any data that existed before sportsbook shipped.
    product: {
      type: String,
      enum: ["casino", "sportsbook", "combined"],
      default: "casino",
      index: true,
    },

    // Raw input metrics pulled from ClickHouse for this affiliate/period
    metrics: {
      ggrCents:        { type: Number, default: 0 },
      ngrCents:        { type: Number, default: 0 },
      ftdCount:        { type: Number, default: 0 },
      // Breakdown of ftdCount after CPA qualification gates ran.
      // qualified + pending + rejected === ftdCount.
      qualifiedFtdCount: { type: Number, default: 0 },
      pendingFtdCount:   { type: Number, default: 0 },
      rejectedFtdCount:  { type: Number, default: 0 },
      depositsCount:   { type: Number, default: 0 },
      depositsCents:   { type: Number, default: 0 },
      playerCount:     { type: Number, default: 0 },
      registrations:   { type: Number, default: 0 },
    },

    // Why each non-qualified FTD failed — one entry per pending/rejected
    // player. Lets the operator surface "waiting for wager" / "deposit
    // below min" in the UI and debug commission disputes.
    ftdQualification: {
      type: [
        {
          playerId:     { type: String },
          ftdDate:      { type: Date },
          depositCents: { type: Number },
          status:       { type: String, enum: ["qualified", "pending", "rejected"] },
          reason:       { type: String }, // e.g. "hold_period_not_met"
        },
      ],
      default: [],
    },

    // Calculated commission amounts
    breakdown: {
      revshareAmountCents: { type: Number, default: 0 },
      cpaAmountCents:      { type: Number, default: 0 },
      // Per-player fixed payouts (plan.type === 'fixed'). Folded into
      // directCents so totalCents stays the sum-of-all source.
      fixedAmountCents:    { type: Number, default: 0 },
      directCents:         { type: Number, default: 0 }, // revshare + cpa + fixed
      overrideCents:       { type: Number, default: 0 }, // earned from sub-affiliates
      totalCents:          { type: Number, default: 0 }, // directCents + overrideCents
      // Negative carryover (only non-zero on plans with negativeCarryover on):
      // carryInCents = prior period's deficit netted into this period's NGR
      // base; carryOutCents = deficit rolling to next period. Both ≤ 0.
      carryInCents:        { type: Number, default: 0 },
      carryOutCents:       { type: Number, default: 0 },
    },

    // IDs of players who triggered the fixed payout in this period. Used
    // by future calcs to dedupe — a player can only earn the fixed
    // payment for an affiliate once, ever. Stored as plain player_id
    // strings (the same format ClickHouse uses).
    fixedPaidPlayerIds: {
      type: [String],
      default: [],
    },

    // Override breakdown — one entry per sub-affiliate whose NGR contributed
    overrideFromSubs: {
      type: [
        {
          subAffiliateId:   { type: mongoose.Schema.Types.ObjectId, ref: "User" },
          subAffiliateCode: { type: String },
          ngrCents:         { type: Number },
          overrideRate:     { type: Number },
          overrideCents:    { type: Number },
        },
      ],
      default: [],
    },

    status: {
      type: String,
      enum: ["draft", "pending_approval", "approved", "paid"],
      default: "draft",
      index: true,
    },

    calculatedAt: { type: Date, default: null },
    approvedAt:   { type: Date, default: null },
    approvedBy:   { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    paidAt:       { type: Date, default: null },
    notes:        { type: String, default: null },
  },
  { timestamps: true },
);

// One report per (affiliate, period, product). Per-product uniqueness
// lets an affiliate carry one casino + one sportsbook + one combined
// report for the same month without conflict.
commissionReportSchema.index(
  { operatorId: 1, affiliateId: 1, "period.year": 1, "period.month": 1, product: 1 },
  { unique: true, name: "unique_report_per_affiliate_period_product" },
);

commissionReportSchema.index({ operatorId: 1, "period.year": 1, "period.month": 1 });
commissionReportSchema.index({ operatorId: 1, status: 1 });

module.exports = mongoose.model("CommissionReport", commissionReportSchema);
