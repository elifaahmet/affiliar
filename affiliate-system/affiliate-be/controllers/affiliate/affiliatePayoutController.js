"use strict";

/**
 * Operator-facing controller for paying affiliates.
 *
 * The pieces:
 *   - GET    /api/affiliate/payouts/pending     — every affiliate who is
 *                                                 owed money right now, plus
 *                                                 their wallet readiness.
 *   - GET    /api/affiliate/payouts             — operator's payout history.
 *   - GET    /api/affiliate/payouts/:id         — single payout detail.
 *   - POST   /api/affiliate/payouts             — body: { affiliateId } →
 *                                                 creates a pending AffiliatePayout
 *                                                 that bundles all of the
 *                                                 affiliate's approved
 *                                                 CommissionReports into a
 *                                                 single transaction. Provider
 *                                                 dispatch happens in a
 *                                                 follow-up step.
 *   - POST   /api/affiliate/payouts/:id/dispatch — push to Coinflux, which
 *                                                 opens a withdrawal for
 *                                                 operator approval.
 *   - POST   /api/affiliate/payouts/:id/cancel  — operator-side cancel
 *                                                 before dispatch.
 *   - GET    /api/affiliate/payouts/settings    — per-operator policy
 *                                                 (currently just the
 *                                                 global min threshold).
 *   - PUT    /api/affiliate/payouts/settings    — update threshold.
 *
 * Source-of-truth for "what's owed"
 * ---------------------------------
 * Strictly `CommissionReport.status === "approved"`. Operators must approve
 * each monthly report before it becomes payable. Reports in `paid` belong
 * to a prior AffiliatePayout; `draft` and `pending_approval` are operator
 * homework (not the affiliate's payable balance).
 */

const mongoose          = require("mongoose");
const Operator          = require("../../models/Operator");
const User              = require("../../models/User");
const CommissionReport  = require("../../models/CommissionReport");
const AffiliatePayout   = require("../../models/AffiliatePayout");
const { logger }        = require("../../middlewares/logger");
const { notify }        = require("../../utils/notify");
const SubAffiliatePayout = require("../../models/SubAffiliatePayout");
const { RESERVED_SUB_PAYOUT_STATUSES } = require("../../utils/affiliateBalance");
const {
  DEFAULT_NETWORK,
  DEFAULT_CURRENCY,
  isPayoutPair,
  addressMatchesNetwork,
  normNetwork,
  normCurrency,
} = require("../../utils/payoutNetworks");

// ── Auth helper ──────────────────────────────────────────────────────────────

// Operator scoping: every CommissionReport carries the tenant Operator._id in
// `operatorId`, and that's what we match against. Operator-user accounts have
// User.operatorId set to that same tenant id.
function operatorOnly(req, res) {
  const user = req.affiliateUser;
  if (!user || user.role !== "operator") {
    res.status(403).json({ error: "Operators only" });
    return null;
  }
  if (!user.operatorId) {
    res.status(403).json({ error: "Operator account is not linked to a tenant" });
    return null;
  }
  return user;
}

// ── Pending payouts (what's owed, per affiliate) ─────────────────────────────

// GET /api/affiliate/payouts/pending
// Aggregates approved CommissionReports by affiliate. An affiliate appears
// once with their total payable and a snapshot of their wallet readiness.
// Operators filter by "ready to pay" client-side (has wallet + above threshold).
exports.listPending = async (req, res) => {
  try {
    const operator = operatorOnly(req, res);
    if (!operator) return;

    const operatorId = operator.operatorId;
    const settings = await Operator.findById(operatorId)
      .select("affiliatePayoutSettings")
      .lean();
    const minPayoutCents = settings?.affiliatePayoutSettings?.minPayoutCents ?? 0;

    // Group approved reports per affiliate.
    const grouped = await CommissionReport.aggregate([
      { $match: { operatorId: new mongoose.Types.ObjectId(String(operatorId)), status: "approved" } },
      {
        $group: {
          _id: "$affiliateId",
          payableCents:  { $sum: "$breakdown.totalCents" },
          reportCount:   { $sum: 1 },
          oldestPeriod:  { $min: { $dateFromParts: { year: "$period.year", month: "$period.month", day: 1 } } },
          reportIds:     { $push: "$_id" },
        },
      },
      { $sort: { payableCents: -1 } },
    ]);

    if (grouped.length === 0) {
      return res.json({ rows: [], minPayoutCents, count: 0 });
    }

    // Hydrate affiliate identity + wallet info.
    const affiliateIds = grouped.map((g) => g._id);
    const users = await User.find({ _id: { $in: affiliateIds } })
      .select("email username name payoutAddress payoutNetwork payoutCurrency payoutAddressSetAt")
      .lean();
    const userMap = new Map(users.map((u) => [String(u._id), u]));

    // Sum each affiliate's outstanding sub-payouts (already reserved) so we
    // can show net payable, not gross. The operator never funds commission
    // twice: subs paid by the parent already came out of the operator's
    // balance.
    const subPaidByParent = await SubAffiliatePayout.aggregate([
      {
        $match: {
          operatorId: new mongoose.Types.ObjectId(String(operatorId)),
          parentId: { $in: affiliateIds },
          status: { $in: RESERVED_SUB_PAYOUT_STATUSES },
        },
      },
      { $group: { _id: "$parentId", paidToSubs: { $sum: "$payableCents" } } },
    ]);
    const subPaidMap = new Map(
      subPaidByParent.map((r) => [String(r._id), r.paidToSubs]),
    );

    const rows = grouped.map((g) => {
      const u = userMap.get(String(g._id)) || {};
      const grossCents = g.payableCents;
      const paidToSubsCents = subPaidMap.get(String(g._id)) || 0;
      const netPayableCents = Math.max(0, grossCents - paidToSubsCents);

      return {
        affiliateId:    g._id,
        affiliate: {
          email:    u.email || null,
          username: u.username || null,
          name:     u.name || null,
        },
        // grossCents = full approved commission this affiliate earned.
        // paidToSubsCents = already routed to their children.
        // payableCents (= net) is what the operator will actually transfer.
        grossCents,
        paidToSubsCents,
        payableCents:   netPayableCents,
        reportCount:    g.reportCount,
        oldestPeriod:   g.oldestPeriod,
        wallet: {
          address:   u.payoutAddress || null,
          network:   u.payoutNetwork  || DEFAULT_NETWORK,
          currency:  u.payoutCurrency || DEFAULT_CURRENCY,
          setAt:     u.payoutAddressSetAt || null,
          ready:     !!u.payoutAddress, // affiliate hasn't given us an address yet?
        },
        // Convenience flag: true = operator can hit "Pay" right now.
        // false = either wallet missing, below threshold, or zero net.
        payable: !!u.payoutAddress && netPayableCents > 0 && netPayableCents >= minPayoutCents,
      };
    });

    return res.json({ rows, minPayoutCents, count: rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── Batch create (bulk action from Commission page) ─────────────────────────

// POST /api/affiliate/payouts/batch
// Body: { year?, month?, affiliateIds?: string[] }
//
// For every affiliate with at least one `approved` CommissionReport — scoped
// by year/month and/or an explicit affiliate-id list from the Commission
// page's select-all / per-row checkboxes — create one `pending`
// AffiliatePayout that bundles all of that affiliate's approved reports.
//
// Skips affiliates who:
//   - have no payout wallet set
//   - have an existing pending OR processing payout (operator should resolve
//     that one first before creating another)
//   - have payable below operator threshold
//
// Returns a summary so the FE can show "X created, Y skipped, Z need
// wallet". The operator then reviews and dispatches on /payouts.
exports.batchCreate = async (req, res) => {
  try {
    const operator = operatorOnly(req, res);
    if (!operator) return;

    const operatorId = operator.operatorId;
    const { year, month, affiliateIds } = req.body || {};

    const reportMatch = { operatorId, status: "approved" };
    if (year && month) {
      reportMatch["period.year"]  = Number(year);
      reportMatch["period.month"] = Number(month);
    }
    if (Array.isArray(affiliateIds) && affiliateIds.length > 0) {
      reportMatch.affiliateId = {
        $in: affiliateIds
          .filter((id) => mongoose.Types.ObjectId.isValid(id))
          .map((id) => new mongoose.Types.ObjectId(id)),
      };
    }

    // Group approved reports per affiliate.
    const grouped = await CommissionReport.aggregate([
      {
        $match: {
          ...reportMatch,
          operatorId: new mongoose.Types.ObjectId(String(operatorId)),
        },
      },
      {
        $group: {
          _id: "$affiliateId",
          payableCents: { $sum: "$breakdown.totalCents" },
          reportIds:    { $push: "$_id" },
        },
      },
    ]);

    if (grouped.length === 0) {
      return res.json({
        created: 0,
        skipped: { noWallet: 0, alreadyHasPayout: 0, belowThreshold: 0, zeroAmount: 0 },
        eligible: 0,
        payouts: [],
      });
    }

    const settings = await Operator.findById(operatorId)
      .select("affiliatePayoutSettings")
      .lean();
    const minPayoutCents = settings?.affiliatePayoutSettings?.minPayoutCents ?? 0;

    const groupedAffiliateIds = grouped.map((g) => g._id);
    const affiliates = await User.find({ _id: { $in: groupedAffiliateIds } })
      .select("payoutAddress payoutNetwork payoutCurrency")
      .lean();
    const affMap = new Map(affiliates.map((a) => [String(a._id), a]));

    // Pre-find existing pending/processing payouts so we don't double-create.
    const existing = await AffiliatePayout.find({
      operatorId,
      affiliateId: { $in: groupedAffiliateIds },
      status: { $in: ["pending", "processing"] },
    }).select("affiliateId status").lean();
    const blockedAffiliateIds = new Set(existing.map((p) => String(p.affiliateId)));

    // Sub-payouts already routed by each affiliate to their children come
    // out of this batch's payable. Pre-fetch once instead of per-loop.
    const subPaidAgg = await SubAffiliatePayout.aggregate([
      {
        $match: {
          operatorId: new mongoose.Types.ObjectId(String(operatorId)),
          parentId: { $in: groupedAffiliateIds },
          status: { $in: RESERVED_SUB_PAYOUT_STATUSES },
        },
      },
      { $group: { _id: "$parentId", paidToSubs: { $sum: "$payableCents" } } },
    ]);
    const subPaidMap = new Map(
      subPaidAgg.map((r) => [String(r._id), r.paidToSubs]),
    );

    // dispatch defaults to true so 'Pay Selected' on the Commission page is
    // one click → money on the wire. Pass dispatch=false to only stage
    // pending rows (used by tests + the operator-confirm flow if we ever
    // bring it back).
    const dispatch = req.body?.dispatch !== false;

    const stats = {
      created: 0,
      dispatched: 0,
      failed: 0,
      skipped: { noWallet: 0, alreadyHasPayout: 0, belowThreshold: 0, zeroAmount: 0 },
      eligible: grouped.length,
      failures: [], // [{ affiliateId, error }]
    };
    const createdPayouts = [];

    for (const g of grouped) {
      const aff = affMap.get(String(g._id));
      if (!aff?.payoutAddress) { stats.skipped.noWallet++; continue; }
      if (blockedAffiliateIds.has(String(g._id))) { stats.skipped.alreadyHasPayout++; continue; }

      const grossCents = g.payableCents;
      const paidToSubsCents = subPaidMap.get(String(g._id)) || 0;
      const netCents = Math.max(0, grossCents - paidToSubsCents);
      if (netCents <= 0) { stats.skipped.zeroAmount++; continue; }
      if (netCents < minPayoutCents) { stats.skipped.belowThreshold++; continue; }

      const payout = await AffiliatePayout.create({
        operatorId,
        affiliateId: g._id,
        sourceReportIds: g.reportIds,
        amountCents: netCents,
        currency: aff.payoutCurrency || DEFAULT_CURRENCY,
        payoutAddress: aff.payoutAddress,
        payoutNetwork: aff.payoutNetwork || DEFAULT_NETWORK,
        status: "pending",
        initiatedBy: operator._id,
      });
      stats.created++;
      createdPayouts.push(payout._id);

      if (dispatch) {
        const r = await dispatchToCoinflux(payout, operator);
        if (r.ok) stats.dispatched++;
        else {
          stats.failed++;
          stats.failures.push({
            affiliateId: String(g._id),
            error: r.error,
          });
        }
      }
    }

    logger.info("affiliate.payout.batch_created", {
      operatorId: String(operatorId),
      year, month, dispatch,
      created: stats.created, dispatched: stats.dispatched, failed: stats.failed,
      skipped: stats.skipped,
    });

    return res.status(201).json({ ...stats, payoutIds: createdPayouts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── Create payout (no dispatch yet) ──────────────────────────────────────────

// POST /api/affiliate/payouts   body: { affiliateId }
// Bundles every approved CommissionReport for this affiliate into a single
// pending AffiliatePayout row. Does NOT call Coinflux — dispatch is a separate
// step so the operator can review the bundle, see the wallet snapshot, and
// then commit.
exports.createPayout = async (req, res) => {
  try {
    const operator = operatorOnly(req, res);
    if (!operator) return;

    const { affiliateId } = req.body || {};
    if (!affiliateId) {
      return res.status(400).json({ error: "affiliateId is required" });
    }

    const operatorId = operator.operatorId;
    const affiliate = await User.findOne({
      _id: affiliateId,
      role: "affiliate",
    }).lean();
    if (!affiliate) {
      return res.status(404).json({ error: "affiliate_not_found" });
    }
    if (!affiliate.payoutAddress) {
      return res.status(409).json({ error: "affiliate_has_no_wallet" });
    }

    // Duplicate guard — an open pending/processing payout for this affiliate
    // blocks a second one. The operator must cancel or wait for the
    // outstanding one to settle before creating another.
    const open = await AffiliatePayout.findOne({
      operatorId, affiliateId,
      status: { $in: ["pending", "processing"] },
    }).select("_id status").lean();
    if (open) {
      return res.status(409).json({
        error: "already_has_payout",
        existingPayoutId: open._id,
        existingStatus: open.status,
      });
    }

    // Lock in the approved reports for this affiliate under this operator.
    const reports = await CommissionReport.find({
      operatorId,
      affiliateId,
      status: "approved",
    }).select("_id breakdown.totalCents").lean();

    if (reports.length === 0) {
      return res.status(409).json({ error: "no_payable_reports" });
    }

    const grossCents = reports.reduce(
      (sum, r) => sum + (r.breakdown?.totalCents || 0),
      0,
    );

    // Net payable = gross commission − whatever this affiliate has already
    // routed to their own subs via Coinflux. Keeps the operator from funding
    // the same commission dollar twice (once to affiliate, once to sub).
    const subPaidAgg = await SubAffiliatePayout.aggregate([
      {
        $match: {
          operatorId: new mongoose.Types.ObjectId(String(operatorId)),
          parentId: new mongoose.Types.ObjectId(String(affiliateId)),
          status: { $in: RESERVED_SUB_PAYOUT_STATUSES },
        },
      },
      { $group: { _id: null, paidToSubs: { $sum: "$payableCents" } } },
    ]);
    const paidToSubsCents = subPaidAgg[0]?.paidToSubs || 0;
    const amountCents = Math.max(0, grossCents - paidToSubsCents);

    if (amountCents <= 0) {
      return res.status(409).json({
        error: "zero_amount",
        grossCents,
        paidToSubsCents,
      });
    }

    // Threshold check against operator setting. Operator can still force
    // through by lowering the threshold first; we don't let them bypass
    // here to keep the policy honest.
    const settings = await Operator.findById(operatorId)
      .select("affiliatePayoutSettings")
      .lean();
    const minPayoutCents = settings?.affiliatePayoutSettings?.minPayoutCents ?? 0;
    if (amountCents < minPayoutCents) {
      return res.status(409).json({
        error: "below_min_threshold",
        amountCents,
        minPayoutCents,
      });
    }

    const payout = await AffiliatePayout.create({
      operatorId,
      affiliateId,
      sourceReportIds: reports.map((r) => r._id),
      amountCents,
      currency: affiliate.payoutCurrency || DEFAULT_CURRENCY,
      payoutAddress: affiliate.payoutAddress,
      payoutNetwork: affiliate.payoutNetwork || DEFAULT_NETWORK,
      status: "pending",
      initiatedBy: operator._id,
    });

    logger.info("affiliate.payout.created", {
      operatorId: String(operatorId),
      affiliateId: String(affiliateId),
      payoutId: String(payout._id),
      amountCents,
      reportCount: reports.length,
    });

    return res.status(201).json({ payout });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── Coinflux provider ────────────────────────────────────────────────────────
//
// The only payout rail. POST /withdrawals opens a payout request, then an
// approve/reject webhook flips it — Coinflux is the approval desk; the
// operator pays out from their own wallet once approved. The Coinflux
// withdrawalId lands in `providerTransactionId` for callback matching.
const axios = require("axios");
const crypto = require("crypto");
const COINFLUX_API_URL        = process.env.COINFLUX_API_URL || "https://api.coinflux.cash";
const COINFLUX_API_KEY        = process.env.COINFLUX_API_KEY || "";
const COINFLUX_WEBHOOK_SECRET = process.env.COINFLUX_WEBHOOK_SECRET || "";
const coinflux = axios.create({
  baseURL: COINFLUX_API_URL,
  timeout: 30000,
  headers: { "Content-Type": "application/json", "X-Api-Key": COINFLUX_API_KEY },
});

// Normalized return shape:
//   { ok: true,  providerTransactionId, providerRequestPayload, providerResponse }
//   { ok: false, failureReason, providerResponse, httpStatus, upstream? }
// Doesn't touch any Mongoose document — callers handle persistence.
async function executeCoinfluxWithdraw({
  amountCents,
  payoutAddress,
  payoutNetwork,
  payoutCurrency,
  payoutId,
  affiliateId,
}) {
  // Every asset we pay in is a USD stablecoin, so cents → units is 1:1
  // whether it's USDT or USDC.
  const amount = Number((amountCents / 100).toFixed(8));
  if (!(amount > 0))  return { ok: false, failureReason: "zero_amount" };
  if (!payoutAddress) return { ok: false, failureReason: "no_wallet" };

  const network  = normNetwork(payoutNetwork   || DEFAULT_NETWORK);
  const currency = normCurrency(payoutCurrency || DEFAULT_CURRENCY);

  // Last gate before real money moves. Coinflux checks this too, but a 400
  // there costs a failed payout row and an affiliate asking why; catching it
  // here means the row never leaves `pending`.
  if (!isPayoutPair(network, currency)) {
    return { ok: false, failureReason: `unsupported_pair: ${currency} on ${network}` };
  }
  if (!addressMatchesNetwork(network, payoutAddress)) {
    return { ok: false, failureReason: `address_network_mismatch: not a ${network} address` };
  }

  const payload = {
    playerId: String(affiliateId),   // just a label — the affiliate this payout is for
    amount,
    address: payoutAddress,
    currency,
    network,
    reference: String(payoutId),     // echoed back in the webhook to match this payout
  };
  const resp = await coinflux.post("/withdrawals", payload, { validateStatus: () => true });
  if (resp.status < 200 || resp.status >= 300) {
    return {
      ok: false,
      failureReason: `coinflux: HTTP ${resp.status}`,
      providerRequestPayload: payload,
      providerResponse: { stage: "create", provider: "coinflux", upstream: resp.data, status: resp.status },
      httpStatus: 502,
      upstream: resp.data,
    };
  }
  return {
    ok: true,
    providerTransactionId: resp?.data?.withdrawalId || null,
    providerRequestPayload: payload,
    providerResponse: { stage: "create", provider: "coinflux", upstream: resp.data },
  };
}

// AffiliatePayout-shaped wrapper: mutates + saves the doc based on the
// result so callers can ignore the persistence churn.
async function dispatchToCoinflux(payout, operator) {
  const result = await executeCoinfluxWithdraw({
    amountCents:    payout.amountCents,
    payoutAddress:  payout.payoutAddress,
    payoutNetwork:  payout.payoutNetwork,
    payoutCurrency: payout.currency,
    payoutId:       String(payout._id),
    affiliateId:    String(payout.affiliateId),
  });

  if (result.providerRequestPayload) payout.providerRequestPayload = result.providerRequestPayload;
  if (result.providerResponse)       payout.providerResponse       = result.providerResponse;

  if (result.ok) {
    payout.status = "processing";
    payout.dispatchedAt = new Date();
    payout.providerTransactionId = result.providerTransactionId;
    await payout.save();
    logger.info("affiliate.payout.dispatched", {
      provider: "coinflux", payoutId: String(payout._id),
      providerTransactionId: result.providerTransactionId, amountCents: payout.amountCents,
    });
    return { ok: true, payout };
  }

  payout.status = "failed";
  payout.failedAt = new Date();
  payout.failureReason = result.failureReason;
  await payout.save();
  logger.error("affiliate.payout.dispatch.failed", {
    provider: "coinflux", payoutId: String(payout._id), reason: result.failureReason,
  });
  return { ok: false, payout, error: result.failureReason, status: result.httpStatus || 502, upstream: result.upstream };
}

// POST /billing/coinflux/callback — Coinflux withdrawal webhook (HMAC-signed).
// Whitelisted in index.js publicAuthPaths. Reuses handleStatusFlip.
exports.handleCoinfluxWithdrawCallback = async (req, res) => {
  try {
    const sig = req.get("X-Coinflux-Signature") || "";
    const expected = crypto
      .createHmac("sha256", COINFLUX_WEBHOOK_SECRET)
      .update(JSON.stringify(req.body || {}))
      .digest("hex");
    const valid =
      sig.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    if (!valid) {
      logger.warn("affiliate.payout.coinflux.bad_sig");
      return res.status(401).json({ success: false, message: "bad signature" });
    }

    const { event, withdrawalId, reference, note, depositId } = req.body || {};

    // Deposit events (subscription billing) → hand off to the billing controller.
    if (event === "deposit.credited" || event === "deposit.rejected") {
      const billingCtl = require("./billingController");
      return billingCtl.handleCoinfluxDeposit({ depositId, event, note }, res);
    }

    const status =
      event === "withdrawal.approved" ? "APPROVED" :
      event === "withdrawal.declined" ? "REJECTED" : null;
    if (!status) return res.json({ success: true, status: "ignored" });

    // Match by our reference (=payoutId) first, then by the provider tx id.
    let payout = null;
    let sub = null;
    if (reference) {
      payout = await AffiliatePayout.findById(reference).catch(() => null);
      if (!payout) sub = await SubAffiliatePayout.findById(reference).catch(() => null);
    }
    if (!payout && !sub && withdrawalId) {
      payout = await AffiliatePayout.findOne({ providerTransactionId: withdrawalId });
      if (!payout) sub = await SubAffiliatePayout.findOne({ providerTransactionId: withdrawalId });
    }

    if (sub)    return handleSubStatusFlip(sub, status, note, res);
    if (payout) return handleStatusFlip(payout, status, note, res);

    logger.warn("affiliate.payout.coinflux.no_match", { withdrawalId, reference });
    return res.status(404).json({ success: false, message: "Payout not found" });
  } catch (err) {
    logger.error("affiliate.payout.coinflux.err", { error: err?.message });
    return res.status(500).json({ success: false, message: err?.message });
  }
};

// POST /api/affiliate/payouts/:id/dispatch  — single-payout dispatch.
exports.dispatchPayout = async (req, res) => {
  try {
    const operator = operatorOnly(req, res);
    if (!operator) return;

    const payout = await AffiliatePayout.findOne({
      _id: req.params.id,
      operatorId: operator.operatorId,
    });
    if (!payout) return res.status(404).json({ error: "payout_not_found" });
    if (payout.status !== "pending") {
      return res.status(409).json({ error: "not_pending", status: payout.status });
    }

    const r = await dispatchToCoinflux(payout, operator);
    if (!r.ok) {
      return res.status(r.status || 502).json({
        error: r.error, upstream: r.upstream || null, payout: r.payout?.toObject?.() || r.payout,
      });
    }
    return res.json({ payout: r.payout.toObject() });
  } catch (err) {
    logger.error("affiliate.payout.dispatch.unexpected", {
      payoutId: req.params.id, error: err?.message, stack: err?.stack,
    });
    res.status(500).json({ error: err.message });
  }
};

// Shared status-flip routine used by the Coinflux withdrawal callback.
// Idempotent on terminal statuses so retries are safe.
async function handleStatusFlip(payout, status, rejectReason, res) {
  if (["paid", "failed", "cancelled"].includes(payout.status)) {
    return res.json({ success: true, status: `Payout already ${payout.status}` });
  }

  const norm = String(status || "").toUpperCase();

  if (norm === "APPROVED" || norm === "SUCCESS" || norm === "COMPLETED") {
    payout.status = "paid";
    payout.paidAt = new Date();
    await payout.save();
    if (payout.sourceReportIds && payout.sourceReportIds.length) {
      await CommissionReport.updateMany(
        { _id: { $in: payout.sourceReportIds }, status: { $ne: "paid" } },
        { $set: { status: "paid", paidAt: new Date() } },
      );
    }
    logger.info("affiliate.payout.callback.approved", {
      payoutId: String(payout._id), providerTransactionId: payout.providerTransactionId,
    });
    return res.json({ success: true, status: "Payout approved" });
  }

  if (norm === "REJECTED" || norm === "FAILED" || norm === "DECLINED") {
    payout.status = "failed";
    payout.failedAt = new Date();
    payout.failureReason = rejectReason || `provider: ${status}`;
    await payout.save();
    logger.info("affiliate.payout.callback.rejected", {
      payoutId: String(payout._id), rejectReason: payout.failureReason,
    });
    return res.json({ success: true, status: "Payout rejected" });
  }

  // Unfamiliar status — ack so Coinflux doesn't retry, but log so we can iterate.
  logger.info("affiliate.payout.callback.unknown_status", {
    payoutId: String(payout._id), status,
  });
  return res.json({ success: true, status: "Ok" });
}

// SubAffiliatePayout-shaped flip. Same enum logic, no CommissionReport
// cascade — sub-payouts aren't tied to reports.
async function handleSubStatusFlip(payout, status, rejectReason, res) {
  if (["paid", "failed", "cancelled"].includes(payout.status)) {
    return res.json({ success: true, status: `Sub-payout already ${payout.status}` });
  }

  const norm = String(status || "").toUpperCase();

  if (norm === "APPROVED" || norm === "SUCCESS" || norm === "COMPLETED") {
    payout.status = "paid";
    payout.paidAt = new Date();
    await payout.save();
    logger.info("sub_payout.callback.approved", {
      subPayoutId: String(payout._id), providerTransactionId: payout.providerTransactionId,
    });
    return res.json({ success: true, status: "Sub-payout approved" });
  }

  if (norm === "REJECTED" || norm === "FAILED" || norm === "DECLINED") {
    payout.status = "failed";
    payout.failedAt = new Date();
    payout.failureReason = rejectReason || `provider: ${status}`;
    await payout.save();
    logger.info("sub_payout.callback.rejected", {
      subPayoutId: String(payout._id), rejectReason: payout.failureReason,
    });
    return res.json({ success: true, status: "Sub-payout rejected" });
  }

  logger.info("sub_payout.callback.unknown_status", {
    subPayoutId: String(payout._id), status,
  });
  return res.json({ success: true, status: "Ok" });
}

// POST /api/affiliate/payouts/:id/cancel
// Cancel a pending payout (typo in wallet, wrong affiliate, etc). Once
// dispatched / paid / failed it can't be cancelled.
exports.cancelPayout = async (req, res) => {
  try {
    const operator = operatorOnly(req, res);
    if (!operator) return;

    const payout = await AffiliatePayout.findOne({
      _id: req.params.id,
      operatorId: operator.operatorId,
    });
    if (!payout) return res.status(404).json({ error: "payout_not_found" });
    if (payout.status !== "pending") {
      return res.status(409).json({ error: "not_pending", status: payout.status });
    }
    payout.status = "cancelled";
    await payout.save();
    return res.json({ payout: payout.toObject() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /api/affiliate/payouts/:id/mark-paid
// Manual reconciliation for out-of-band transfers (e.g. operator paid via
// another channel and just wants to settle the books). Flips status to
// 'paid', flips the underlying CommissionReports to 'paid' too.
exports.markPaid = async (req, res) => {
  try {
    const operator = operatorOnly(req, res);
    if (!operator) return;

    const payout = await AffiliatePayout.findOne({
      _id: req.params.id,
      operatorId: operator.operatorId,
    });
    if (!payout) return res.status(404).json({ error: "payout_not_found" });
    if (["paid", "cancelled"].includes(payout.status)) {
      return res.status(409).json({ error: "terminal_status", status: payout.status });
    }

    // Optional free-form note (external transfer reference, etc.). Empty
    // string collapses to null so the list doesn't render a blank chip.
    const note = typeof req.body?.paymentNote === "string"
      ? req.body.paymentNote.trim()
      : "";

    payout.status = "paid";
    payout.paidAt = new Date();
    payout.paymentNote = note || null;
    await payout.save();

    if (payout.sourceReportIds && payout.sourceReportIds.length) {
      await CommissionReport.updateMany(
        { _id: { $in: payout.sourceReportIds }, status: { $ne: "paid" } },
        { $set: { status: "paid", paidAt: new Date() } },
      );
    }

    notify({
      userId: payout.affiliateId,
      operatorId: payout.operatorId,
      type: "payout_paid",
      title: "Payout marked paid",
      body: `${(payout.amountCents / 100).toFixed(2)} ${payout.currency || "USDT"} has been paid to your wallet.`,
      link: "/affiliate-portal/payouts",
    });

    return res.json({ payout: payout.toObject() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── History ──────────────────────────────────────────────────────────────────

// GET /api/affiliate/payouts?status=&affiliateId=&limit=&before=
exports.listPayouts = async (req, res) => {
  try {
    const operator = operatorOnly(req, res);
    if (!operator) return;

    const { status, affiliateId, limit, before } = req.query || {};
    const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const match = { operatorId: operator.operatorId };
    if (status) match.status = status;
    if (affiliateId) match.affiliateId = affiliateId;
    if (before) match.createdAt = { $lt: new Date(before) };

    const payouts = await AffiliatePayout.find(match)
      .sort({ createdAt: -1 })
      .limit(lim)
      .populate("affiliateId", "email username name")
      .lean();

    return res.json({ payouts, count: payouts.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/affiliate/payouts/:id
exports.getPayout = async (req, res) => {
  try {
    const operator = operatorOnly(req, res);
    if (!operator) return;

    const payout = await AffiliatePayout.findOne({
      _id: req.params.id,
      operatorId: operator.operatorId,
    })
      .populate("affiliateId", "email username name")
      .populate("initiatedBy", "email username name")
      .lean();
    if (!payout) return res.status(404).json({ error: "payout_not_found" });

    // Pull the source reports so the operator can see what this payout settles.
    const reports = await CommissionReport.find({
      _id: { $in: payout.sourceReportIds || [] },
    })
      .select("period product breakdown.totalCents status")
      .lean();

    return res.json({ payout, reports });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── Settings ─────────────────────────────────────────────────────────────────

// GET /api/affiliate/payouts/settings
exports.getSettings = async (req, res) => {
  try {
    const operator = operatorOnly(req, res);
    if (!operator) return;
    const op = await Operator.findById(operator.operatorId)
      .select("affiliatePayoutSettings")
      .lean();
    return res.json({
      affiliatePayoutSettings: op?.affiliatePayoutSettings || {
        minPayoutCents: 0,
        currency: "USD",
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PUT /api/affiliate/payouts/settings   body: { minPayoutCents, currency }
exports.updateSettings = async (req, res) => {
  try {
    const operator = operatorOnly(req, res);
    if (!operator) return;

    const { minPayoutCents, currency } = req.body || {};
    const update = {};
    if (Number.isFinite(Number(minPayoutCents)) && Number(minPayoutCents) >= 0) {
      update["affiliatePayoutSettings.minPayoutCents"] = Math.floor(Number(minPayoutCents));
    }
    if (typeof currency === "string" && currency.trim()) {
      update["affiliatePayoutSettings.currency"] = currency.trim().toUpperCase();
    }
    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: "no_valid_fields" });
    }

    const updated = await Operator.findByIdAndUpdate(
      operator.operatorId,
      { $set: update },
      { new: true, select: "affiliatePayoutSettings" },
    ).lean();

    return res.json({ affiliatePayoutSettings: updated.affiliatePayoutSettings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Pure withdraw helper, exposed for the affiliate-portal controller which
// uses the same rail to settle sub-affiliate payouts.
exports.executeCoinfluxWithdraw = executeCoinfluxWithdraw;
