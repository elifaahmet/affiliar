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
// Moves a `pending` payout to `processing`. Real Sans call is filed under
// TODO — once the provider's withdrawal endpoint is probed we'll fill in
// the actual transfer + record `sansTransactionId`.
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

    // TODO: Sans Getirsin withdrawal call goes here. For now flip to
    // processing so the UI surfaces it correctly, but mark a stub
    // sansRequestPayload so we can recover state once the integration lands.
    payout.status = "processing";
    payout.dispatchedAt = new Date();
    payout.sansRequestPayload = { note: "stub — withdrawal API not yet wired" };
    await payout.save();

    logger.info("affiliate.payout.dispatched_stub", {
      payoutId: String(payout._id),
      amountCents: payout.amountCents,
      payoutAddress: payout.payoutAddress,
    });

    return res.json({ payout: payout.toObject() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

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
