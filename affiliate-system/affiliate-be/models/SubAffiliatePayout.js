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

    // The subPlan that drove this row, snapshotted at calc time.
    subPlanSnapshot: {
      type:            { type: String, enum: ["revshare", "cpa", "hybrid"] },
      revshareRate:    { type: Number, default: 0 },
      cpaPerFtdCents:  { type: Number, default: 0 },
      _id: false,
    },

    // Components
    revshareAmountCents: { type: Number, default: 0 },
    cpaAmountCents:      { type: Number, default: 0 },
    payableCents:        { type: Number, default: 0 },

    status: {
      type: String,
      enum: ["draft", "paid"],
      default: "draft",
      index: true,
    },

    calculatedAt: { type: Date, default: null },
    paidAt:       { type: Date, default: null },
    notes:        { type: String, default: null },
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
