"use strict";

const mongoose = require("mongoose");

/**
 * One row per real-money transfer from an operator to one of their
 * affiliates. Created when the operator clicks "Pay" on the pending-payouts
 * screen; advanced by the Coinflux webhook callback (or by a manual
 * status flip if the operator is reconciling an out-of-band transfer).
 *
 * Why a dedicated model rather than a status flip on CommissionReport
 * -------------------------------------------------------------------
 * A single payout often consolidates *multiple* CommissionReports — an
 * affiliate may have an unpaid October casino report, a November casino
 * report, and a November sportsbook report all in `approved`, and the
 * operator typically pays them in one Coinflux transaction. This row anchors
 * the transaction and links back to all the reports it settles via
 * `sourceReportIds`. When the payout succeeds, every linked report flips
 * to `paid` together.
 *
 * Wallet snapshot
 * ---------------
 * `payoutAddress` is the affiliate's wallet at the time of payout. We
 * snapshot it so historical rows remain audit-correct if the affiliate
 * later edits their wallet on their profile.
 */
const affiliatePayoutSchema = new mongoose.Schema(
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

    // Settles these CommissionReports (each one flips to `paid` when this
    // payout succeeds). At least one entry — empty would mean we paid out
    // nothing, which is a bug.
    sourceReportIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "CommissionReport",
      },
    ],

    // Snapshot of the payable amount at the time of payout. Equals the sum
    // of `breakdown.totalCents` across all `sourceReportIds` at the time
    // the operator clicked Pay. Stored separately so reconciliation
    // doesn't require re-aggregating.
    amountCents: {
      type: Number,
      required: true,
      min: 1, // 0 would be a no-op; reject at controller-level too
    },
    currency: {
      type: String,
      default: "USDT",
    },

    // Wallet snapshot — see header comment.
    payoutAddress: {
      type: String,
      required: true,
    },
    payoutNetwork: {
      type: String,
      enum: ["TRC20"],
      default: "TRC20",
    },

    /**
     * pending     — created locally, not yet dispatched to provider
     * processing  — dispatched to Coinflux, awaiting webhook confirmation
     * paid        — provider confirmed transfer (or operator marked paid)
     * failed      — provider reported failure (insufficient funds, invalid
     *               address, rate-limit, etc). Operator can retry by
     *               creating a new payout.
     * cancelled   — operator cancelled before dispatch (e.g. typo in wallet)
     */
    status: {
      type: String,
      enum: ["pending", "processing", "paid", "failed", "cancelled"],
      default: "pending",
      index: true,
    },
    failureReason: { type: String, default: null },

    // Coinflux integration metadata. `providerTransactionId` is the
    // provider's transaction id; we use it to match webhook callbacks back
    // to this row. `providerRequestPayload` + `providerResponse` are kept for
    // debugging — Coinflux's error envelopes don't always survive into logs.
    providerTransactionId:   { type: String, default: null, index: true },
    providerRequestPayload:  { type: mongoose.Schema.Types.Mixed, default: null },
    providerResponse:        { type: mongoose.Schema.Types.Mixed, default: null },

    initiatedAt:    { type: Date, default: Date.now },
    dispatchedAt:   { type: Date, default: null },
    paidAt:         { type: Date, default: null },
    failedAt:       { type: Date, default: null },

    // Who clicked Pay. Useful audit when an operator has multiple sub-admins.
    initiatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // Free-form note captured when an operator marks a payout paid by hand
    // (e.g. an external transfer reference). Optional — may be empty/null.
    paymentNote: { type: String, default: null, trim: true },
  },
  { timestamps: true },
);

// Operator dashboard: "show me payouts in chronological order"
affiliatePayoutSchema.index({ operatorId: 1, createdAt: -1 });
// Affiliate dashboard: "my payout history"
affiliatePayoutSchema.index({ affiliateId: 1, createdAt: -1 });
// Operator filter by status (pending/processing/failed surface needs attention)
affiliatePayoutSchema.index({ operatorId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model("AffiliatePayout", affiliatePayoutSchema);
