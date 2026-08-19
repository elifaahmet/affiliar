"use strict";

const mongoose = require("mongoose");

/**
 * What a parent affiliate owes one of their direct children for a given
 * (period, product). One row per parent → sub edge per period per product.
 *
 * Internal accounting between affiliates — the operator never approves or
 * pays these. The operator-payable lives on the top-level affiliate's
 * CommissionReport; SubAffiliatePayout is each affiliate's "internal P&L"
 * showing what's owed downstream.
 */
const subAffiliatePayoutSchema = new mongoose.Schema(
  {
    operatorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Operator",
      required: true,
      index: true,
    },
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    subId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    period: {
      year:  { type: Number, required: true },
      month: { type: Number, required: true, min: 1, max: 12 },
    },
    product: {
      type: String,
      enum: ["casino", "sportsbook", "combined"],
      default: "casino",
    },

    // Sub's subtree metrics this payout was computed on. Stored so the
    // affiliate can audit why the number is what it is, even if the sub's
    // subtree changes shape later.
    subtreeMetrics: {
      ngrCents:           { type: Number, default: 0 },
      ggrCents:           { type: Number, default: 0 },
      ftdCount:           { type: Number, default: 0 },
      qualifiedFtdCount:  { type: Number, default: 0 },
      registrations:      { type: Number, default: 0 },
      depositsCents:      { type: Number, default: 0 },
      playerCount:        { type: Number, default: 0 },
    },

    // The subPlan that drove this row, snapshotted at calc time. Both rates
    // are a % of the parent's commission on the sub's subtree.
    subPlanSnapshot: {
      type:            { type: String, enum: ["revshare", "cpa", "hybrid"] },
      revshareRate:    { type: Number, default: 0 },
      cpaSharePercent: { type: Number, default: 0 },
      _id: false,
    },

    // What the parent held for this subtree — the basis each share % above
    // was applied to. Stored so the affiliate can see "X% of the parent's
    // $Y commission" rather than an opaque figure.
    basisRevshareCents: { type: Number, default: 0 },
    basisCpaCents:      { type: Number, default: 0 },

    // Components
    revshareAmountCents: { type: Number, default: 0 },
    cpaAmountCents:      { type: Number, default: 0 },
    payableCents:        { type: Number, default: 0 },

    /**
     * draft       — calculated, not actioned. The affiliate's audit of
     *               "what I'll owe my subs this period".
     * pending     — affiliate clicked Pay but Coinflux dispatch hasn't run yet.
     * processing  — Coinflux accepted the withdrawal; awaiting webhook ack.
     * paid        — Coinflux confirmed delivery (or operator manually marked).
     * failed      — Coinflux rejected / on-chain failure. Affiliate can retry by
     *               creating a fresh payout (this row stays for audit).
     * cancelled   — affiliate cancelled a pending payout before dispatch.
     */
    status: {
      type: String,
      enum: ["draft", "pending", "processing", "paid", "failed", "cancelled"],
      default: "draft",
      index: true,
    },

    // ── Coinflux transfer metadata ────────────────────────────────────────────
    //
    // Sub-affiliate payouts dispatch via the *operator's* Coinflux merchant
    // account (sub-affiliates aren't merchants themselves). The platform
    // tracks accounting: the affiliate's internal balance debits by this
    // amount, and the operator's eventual net payout to the affiliate is
    // reduced by paid/processing/pending sub-payouts so the operator
    // never funds the same dollar twice.
    payoutAddress: { type: String, default: null }, // sub's TRC20 wallet at dispatch
    payoutNetwork: { type: String, enum: ["TRC20"], default: "TRC20" },
    providerTransactionId:   { type: String, default: null, index: true },
    providerRequestPayload:  { type: mongoose.Schema.Types.Mixed, default: null },
    providerResponse:        { type: mongoose.Schema.Types.Mixed, default: null },

    calculatedAt:  { type: Date, default: null },
    initiatedAt:   { type: Date, default: null },
    dispatchedAt:  { type: Date, default: null },
    paidAt:        { type: Date, default: null },
    failedAt:      { type: Date, default: null },
    failureReason: { type: String, default: null },
    notes:         { type: String, default: null },
  },
  { timestamps: true },
);

subAffiliatePayoutSchema.index(
  { operatorId: 1, parentId: 1, subId: 1, "period.year": 1, "period.month": 1, product: 1 },
  { unique: true, name: "unique_payout_per_edge_period_product" },
);
subAffiliatePayoutSchema.index({ subId: 1, "period.year": 1, "period.month": 1 });
subAffiliatePayoutSchema.index({ parentId: 1, "period.year": 1, "period.month": 1 });

module.exports = mongoose.model("SubAffiliatePayout", subAffiliatePayoutSchema);
