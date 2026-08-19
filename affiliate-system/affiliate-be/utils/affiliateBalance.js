"use strict";

/**
 * Per-affiliate internal balance arithmetic.
 *
 * Each affiliate has an in-platform ledger that tracks:
 *
 *     earned                 = sum of `approved` CommissionReport.totalCents
 *                              the operator owes them for direct activity
 *     paidToMe               = sum of AffiliatePayout sent to *me* (the
 *                              affiliate) — pending + processing + paid all
 *                              count, because pending/processing already
 *                              earmark operator's Coinflux balance
 *     paidToMySubs           = sum of SubAffiliatePayout I (parent) have
 *                              committed to my children — same rule: any
 *                              row that isn't draft/failed/cancelled is
 *                              reserved spend
 *
 *     balance = earned − paidToMe − paidToMySubs
 *
 * Positive balance is what's still settle-able for me — either operator
 * pays me net, or I dispatch more sub-payouts. Zero or negative means I've
 * already directed my entire commission and any new sub-payment would
 * overdraft the operator's account (we block it).
 *
 * Sub-affiliates have no CommissionReport (per Phase 2 redesign) — their
 * "earned" is their incoming SubAffiliatePayouts. This helper handles
 * either side via the `includeIncomingSubPayouts` flag.
 */

const mongoose          = require("mongoose");
const CommissionReport  = require("../models/CommissionReport");
const AffiliatePayout   = require("../models/AffiliatePayout");
const SubAffiliatePayout = require("../models/SubAffiliatePayout");

// Statuses where the cash is already reserved against the operator's Coinflux
// balance. draft (sub-payouts only), failed, and cancelled never lock
// funds.
const RESERVED_AFFILIATE_PAYOUT_STATUSES = ["pending", "processing", "paid"];
const RESERVED_SUB_PAYOUT_STATUSES      = ["pending", "processing", "paid"];

async function sum(Model, match, field) {
  const r = await Model.aggregate([
    { $match: match },
    { $group: { _id: null, total: { $sum: `$${field}` } } },
  ]);
  return r[0]?.total || 0;
}

/**
 * @param {Object} opts
 * @param {string|ObjectId} opts.operatorId      tenant operator id
 * @param {string|ObjectId} opts.affiliateUserId User._id of the affiliate
 * @param {boolean}         [opts.includeIncomingSubPayouts=false]
 *        If true, also counts incoming sub-payouts as "earned". Use for
 *        sub-affiliates (who have no CommissionReports). For top-level
 *        affiliates leave it false — their earned comes from CommissionReports.
 * @returns {Promise<{ earnedCents, paidToMeCents, paidToMySubsCents, balanceCents }>}
 */
async function computeBalance({
  operatorId,
  affiliateUserId,
  includeIncomingSubPayouts = false,
}) {
  const opId = new mongoose.Types.ObjectId(String(operatorId));
  const affId = new mongoose.Types.ObjectId(String(affiliateUserId));

  // Earned — approved direct commission.
  let earnedCents = await sum(
    CommissionReport,
    { operatorId: opId, affiliateId: affId, status: { $in: ["approved", "paid"] } },
    "breakdown.totalCents",
  );

  // Sub-affiliates (no own CommissionReport) accrue via incoming sub-payouts.
  if (includeIncomingSubPayouts) {
    earnedCents += await sum(
      SubAffiliatePayout,
      { operatorId: opId, subId: affId, status: { $in: RESERVED_SUB_PAYOUT_STATUSES } },
      "payableCents",
    );
  }

  const paidToMeCents = await sum(
    AffiliatePayout,
    {
      operatorId: opId,
      affiliateId: affId,
      status: { $in: RESERVED_AFFILIATE_PAYOUT_STATUSES },
    },
    "amountCents",
  );

  const paidToMySubsCents = await sum(
    SubAffiliatePayout,
    {
      operatorId: opId,
      parentId: affId,
      status: { $in: RESERVED_SUB_PAYOUT_STATUSES },
    },
    "payableCents",
  );

  const balanceCents = earnedCents - paidToMeCents - paidToMySubsCents;

  return { earnedCents, paidToMeCents, paidToMySubsCents, balanceCents };
}

module.exports = {
  computeBalance,
  RESERVED_AFFILIATE_PAYOUT_STATUSES,
  RESERVED_SUB_PAYOUT_STATUSES,
};
