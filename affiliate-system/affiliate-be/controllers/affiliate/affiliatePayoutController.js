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
 *                                                 single transaction. Sans
 *                                                 dispatch happens in a
 *                                                 follow-up step.
 *   - POST   /api/affiliate/payouts/:id/dispatch — push to Sans (placeholder
 *                                                 until the withdrawal API
 *                                                 surface is probed +
 *                                                 wired).
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
// Re-use the Sans token cache + axios instance from billingController so
// deposits and payouts share the same per-operator merchant session.
const { getSansToken, sansProvider } = require("./billingController");

// Sans's chain label mapping — the withdraw fields list returns the network
// in their long form (e.g. "Tron.network (TRC20)") so we translate from our
// short enum when populating fields.
const SANS_NETWORK_LABEL = {
  TRC20: "Tron.network (TRC20)",
  ERC20: "Ethereum Mainnet (ERC20)",
  BEP20: "BNB Smart Chain",
};

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
      .select("email username name payoutAddress payoutNetwork payoutAddressSetAt")
      .lean();
    const userMap = new Map(users.map((u) => [String(u._id), u]));

    const rows = grouped.map((g) => {
      const u = userMap.get(String(g._id)) || {};
      return {
        affiliateId:    g._id,
        affiliate: {
          email:    u.email || null,
          username: u.username || null,
          name:     u.name || null,
        },
        payableCents:   g.payableCents,
        reportCount:    g.reportCount,
        oldestPeriod:   g.oldestPeriod,
        wallet: {
          address:   u.payoutAddress || null,
          network:   u.payoutNetwork || "TRC20",
          setAt:     u.payoutAddressSetAt || null,
          ready:     !!u.payoutAddress, // affiliate hasn't given us an address yet?
        },
        // Convenience flag: true = operator can hit "Pay" right now.
        // false = either wallet missing or below operator's threshold.
        payable: !!u.payoutAddress && g.payableCents >= minPayoutCents,
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
      .select("payoutAddress payoutNetwork")
      .lean();
    const affMap = new Map(affiliates.map((a) => [String(a._id), a]));

    // Pre-find existing pending/processing payouts so we don't double-create.
    const existing = await AffiliatePayout.find({
      operatorId,
      affiliateId: { $in: groupedAffiliateIds },
      status: { $in: ["pending", "processing"] },
    }).select("affiliateId status").lean();
    const blockedAffiliateIds = new Set(existing.map((p) => String(p.affiliateId)));

    const stats = {
      created: 0,
      skipped: { noWallet: 0, alreadyHasPayout: 0, belowThreshold: 0, zeroAmount: 0 },
      eligible: grouped.length,
    };
    const createdPayouts = [];

    for (const g of grouped) {
      const aff = affMap.get(String(g._id));
      if (!aff?.payoutAddress) { stats.skipped.noWallet++; continue; }
      if (blockedAffiliateIds.has(String(g._id))) { stats.skipped.alreadyHasPayout++; continue; }
      if (g.payableCents <= 0) { stats.skipped.zeroAmount++; continue; }
      if (g.payableCents < minPayoutCents) { stats.skipped.belowThreshold++; continue; }

      const payout = await AffiliatePayout.create({
        operatorId,
        affiliateId: g._id,
        sourceReportIds: g.reportIds,
        amountCents: g.payableCents,
        currency: "USDT",
        payoutAddress: aff.payoutAddress,
        payoutNetwork: aff.payoutNetwork || "TRC20",
        status: "pending",
        initiatedBy: operator._id,
      });
      stats.created++;
      createdPayouts.push(payout._id);
    }

    logger.info("affiliate.payout.batch_created", {
      operatorId: String(operatorId),
      year, month,
      ...stats,
    });

    return res.status(201).json({ ...stats, payoutIds: createdPayouts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── Create payout (no dispatch yet) ──────────────────────────────────────────

// POST /api/affiliate/payouts   body: { affiliateId }
// Bundles every approved CommissionReport for this affiliate into a single
// pending AffiliatePayout row. Does NOT call Sans — dispatch is a separate
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

    // Lock in the approved reports for this affiliate under this operator.
    const reports = await CommissionReport.find({
      operatorId,
      affiliateId,
      status: "approved",
    }).select("_id breakdown.totalCents").lean();

    if (reports.length === 0) {
      return res.status(409).json({ error: "no_payable_reports" });
    }

    const amountCents = reports.reduce(
      (sum, r) => sum + (r.breakdown?.totalCents || 0),
      0,
    );
    if (amountCents <= 0) {
      return res.status(409).json({ error: "zero_amount" });
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
      currency: "USDT",
      payoutAddress: affiliate.payoutAddress,
      payoutNetwork: affiliate.payoutNetwork || "TRC20",
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

// ── Dispatch to Sans (placeholder until the withdrawal surface is wired) ─────

// POST /api/affiliate/payouts/:id/dispatch
// Real Sans Getirsin withdrawal — mirrors the 3-step dance the player-side
// service uses (see new-pixup/.../sans-getirsin/sans-server.js for the
// reference). On success the payout moves to `processing` and we wait for
// the Sans webhook to flip it to `paid` or `failed`.
//
//   1) GET /payment/withdraw?amount=X  — list withdraw accounts for this
//      amount. Returns `data[0]._id` (the bankAccount id we'll post against)
//      and `data[0].withdrawFields` (the fields we have to populate).
//   2) POST /payment/withdraw         — body {
//                                        bank, amount, fields[], extraData
//                                      }. Returns the provider's
//                                        transactionId.
//
// Step (1) reuses the cached merchant token from billingController. If the
// operator has never paid via Sans for their own subscription the token
// fetch still works — we just call /payment/json on first use.
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

    // Amount in USDT — AffiliatePayout.amountCents is a USD-pegged fiat-cents
    // representation; for USDT-TRC20 we assume 1:1 (USDT ≈ USD). If we ever
    // settle commission in a non-USD currency we'd need an FX conversion
    // step before the network call.
    const amountUsdt = Number((payout.amountCents / 100).toFixed(8));
    if (!(amountUsdt > 0)) {
      return res.status(409).json({ error: "zero_amount" });
    }

    let token;
    try {
      token = await getSansToken(operator.operatorId, operator);
    } catch (err) {
      logger.error("affiliate.payout.dispatch.token_failed", {
        payoutId: String(payout._id),
        error: err?.message,
      });
      payout.status = "failed";
      payout.failedAt = new Date();
      payout.failureReason = `token: ${err?.message || "no token"}`;
      payout.sansResponse = { stage: "token", upstream: err?.upstream || null };
      await payout.save();
      return res.status(err.status || 502).json({ error: payout.failureReason });
    }

    // ── STEP 1: list withdraw accounts ────────────────────────────────────
    const listResp = await sansProvider.get("/withdraw", {
      params: { amount: amountUsdt.toFixed(8) },
      headers: { Authorization: `Bearer ${token}` },
      validateStatus: () => true,
    });
    if (listResp.status < 200 || listResp.status >= 300) {
      payout.status = "failed";
      payout.failedAt = new Date();
      payout.failureReason = `list: HTTP ${listResp.status}`;
      payout.sansResponse = { stage: "list", upstream: listResp.data };
      await payout.save();
      logger.error("affiliate.payout.dispatch.list_failed", {
        payoutId: String(payout._id), status: listResp.status, body: listResp.data,
      });
      return res.status(502).json({ error: payout.failureReason, upstream: listResp.data });
    }

    const account = listResp?.data?.data?.[0];
    if (!account?._id) {
      payout.status = "failed";
      payout.failedAt = new Date();
      payout.failureReason = "list: no withdraw account returned";
      payout.sansResponse = { stage: "list", upstream: listResp.data };
      await payout.save();
      return res.status(502).json({
        error: "Sans returned no withdraw account for this amount",
      });
    }

    const networkLabel = SANS_NETWORK_LABEL[payout.payoutNetwork] || payout.payoutNetwork;
    const fields = (account.withdrawFields || []).map((f) => {
      const name = f.name;
      if (name === "Wallet") return { name, value: payout.payoutAddress };
      if (name === "Chain")  return { name, value: networkLabel };
      // TRC20 USDT doesn't need memo/tag/wallet-type — leave blank for any
      // unexpected fields rather than dropping them, so the API doesn't 400
      // on us about a missing column.
      return { name, value: "" };
    });

    // ── STEP 2: create withdrawal ─────────────────────────────────────────
    const payload = {
      bank: account._id,
      amount: amountUsdt,
      fields,
      extraData: {
        payoutId: String(payout._id),
        operatorId: String(payout.operatorId),
        affiliateId: String(payout.affiliateId),
        network: networkLabel,
      },
    };
    const createResp = await sansProvider.post("/withdraw", payload, {
      headers: { Authorization: `Bearer ${token}` },
      validateStatus: () => true,
    });

    payout.sansRequestPayload = payload;
    payout.sansResponse = { stage: "create", upstream: createResp.data, status: createResp.status };

    if (createResp.status < 200 || createResp.status >= 300) {
      payout.status = "failed";
      payout.failedAt = new Date();
      payout.failureReason = `create: HTTP ${createResp.status}`;
      await payout.save();
      logger.error("affiliate.payout.dispatch.create_failed", {
        payoutId: String(payout._id), status: createResp.status, body: createResp.data,
      });
      return res.status(502).json({ error: payout.failureReason, upstream: createResp.data });
    }

    const sansTxId =
      createResp?.data?.data?.transactionId ||
      createResp?.data?.transactionId ||
      createResp?.data?.data?._id ||
      null;

    payout.status = "processing";
    payout.dispatchedAt = new Date();
    payout.sansTransactionId = sansTxId;
    await payout.save();

    logger.info("affiliate.payout.dispatched", {
      payoutId: String(payout._id),
      sansTransactionId: sansTxId,
      amountUsdt,
      payoutAddress: payout.payoutAddress,
    });

    return res.json({ payout: payout.toObject() });
  } catch (err) {
    logger.error("affiliate.payout.dispatch.unexpected", {
      payoutId: req.params.id, error: err?.message, stack: err?.stack,
    });
    res.status(500).json({ error: err.message });
  }
};

// ── Sans webhook (withdraw branch) ───────────────────────────────────────────
//
// Called from billingController.handleSansCallback when `type === "WITHDRAW"`.
// Matches the inbound `transactionId` against an AffiliatePayout's
// `sansTransactionId` and advances the row's status. Same status enum as
// deposits ("APPROVED" / "REJECTED"). Idempotent on re-deliveries.
exports.handleSansWithdrawCallback = async (req, res) => {
  const body = req.body || {};
  const { action, transactionId, status, rejectReason, extraData } = body;

  try {
    const payout = await AffiliatePayout.findOne({ sansTransactionId: transactionId });
    if (!payout) {
      // Surface as 404 so the provider retries (or we can match by extraData
      // payoutId — fallback below).
      const fallbackId = extraData?.payoutId;
      const byId = fallbackId
        ? await AffiliatePayout.findById(fallbackId)
        : null;
      if (!byId) {
        logger.warn("affiliate.payout.callback.no_match", { transactionId, action });
        return res.status(404).json({ success: false, message: "Payout not found" });
      }
      // Back-fill the sansTransactionId on first matching callback.
      byId.sansTransactionId = transactionId;
      await byId.save();
      return handleStatusFlip(byId, status, rejectReason, res);
    }

    return handleStatusFlip(payout, status, rejectReason, res);
  } catch (err) {
    logger.error("affiliate.payout.callback.err", {
      transactionId, action, status, error: err?.message,
    });
    return res.status(500).json({ success: false, message: err?.message });
  }
};

// Shared status-flip routine used by handleSansWithdrawCallback. Idempotent
// on terminal statuses so retries are safe.
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
      payoutId: String(payout._id), sansTransactionId: payout.sansTransactionId,
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

  // Unfamiliar status — ack so Sans doesn't retry, but log so we can iterate.
  logger.info("affiliate.payout.callback.unknown_status", {
    payoutId: String(payout._id), status,
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

    payout.status = "paid";
    payout.paidAt = new Date();
    await payout.save();

    if (payout.sourceReportIds && payout.sourceReportIds.length) {
      await CommissionReport.updateMany(
        { _id: { $in: payout.sourceReportIds }, status: { $ne: "paid" } },
        { $set: { status: "paid", paidAt: new Date() } },
      );
    }

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
