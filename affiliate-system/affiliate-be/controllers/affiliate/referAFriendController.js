"use strict";

/**
 * Operator-facing endpoints for the refer-a-friend dashboard:
 *   - per-brand config CRUD
 *   - signing-secret rotation
 *   - test event injection (builds a synthetic delivery; the worker
 *     dispatches it like any other)
 *   - activity table (referrals)
 *   - delivery audit + manual replay
 *
 * Mounted under /api/v1/refer/*. All endpoints are operator-scoped —
 * cross-operator access is blocked at every read and write.
 */

const Brand              = require("../../models/Brand");
const ReferAFriendConfig = require("../../models/ReferAFriendConfig");
const PlayerReferral     = require("../../models/PlayerReferral");
const RewardDelivery     = require("../../models/RewardDelivery");
const {
  resolveOperatorPlan, planError,
} = require("../../middlewares/planGuard");

// ── Auth helpers ──────────────────────────────────────────────────────────────

// We scope refer-a-friend by the operator user's own _id, NOT
// user.operatorId (a tenant pointer in this codebase). Brand.operatorId
// already points at the user — brandController and feesController
// follow the same convention.
function operatorOnly(req, res) {
  const user = req.affiliateUser;
  if (!user || user.role !== "operator") {
    res.status(403).json({ error: "Operator authentication required" });
    return null;
  }
  if (!user._id) {
    res.status(403).json({ error: "No operator linked to account" });
    return null;
  }
  return String(user._id);
}

async function loadOwnedBrand(brandId, operatorId) {
  const brand = await Brand.findById(brandId).lean();
  if (!brand) return { ok: false, status: 404, error: "brand_not_found" };
  if (String(brand.operatorId) !== String(operatorId)) {
    return { ok: false, status: 403, error: "brand_not_owned_by_operator" };
  }
  return { ok: true, brand };
}

// ── Config CRUD ───────────────────────────────────────────────────────────────

// GET /api/v1/refer/config — list all brand configs for this operator
exports.listConfigs = async (req, res) => {
  const operatorId = operatorOnly(req, res);
  if (!operatorId) return;

  const configs = await ReferAFriendConfig.find({ operatorId }).lean();
  return res.status(200).json({ configs });
};

// GET /api/v1/refer/config/:brandId
exports.getConfig = async (req, res) => {
  const operatorId = operatorOnly(req, res);
  if (!operatorId) return;

  const { brandId } = req.params;
  const ownership = await loadOwnedBrand(brandId, operatorId);
  if (!ownership.ok) return res.status(ownership.status).json({ error: ownership.error });

  const config = await ReferAFriendConfig.findOne({ brandId }).lean();
  return res.status(200).json({ config });
};

// PUT /api/v1/refer/config/:brandId — upsert. Pull model: no webhook
// fields here. Casino backend pulls rewards from /player/:id/rewards
// when the player visits their "My Rewards" page.
exports.upsertConfig = async (req, res) => {
  const operatorId = operatorOnly(req, res);
  if (!operatorId) return;

  const { brandId } = req.params;
  const ownership = await loadOwnedBrand(brandId, operatorId);
  if (!ownership.ok) return res.status(ownership.status).json({ error: ownership.error });

  const {
    enabled,
    reward,
    refereeReward,
    recurringReward,
    qualification,
    caps,
  } = req.body || {};

  // Crew (tiered) lives on the Pro plan (or any plan granted the
  // crewSystem flag via Operator.featureOverrides for a custom deal).
  // The planGuard on /refer/* (checkReferAFriend) is the broader gate;
  // this is the per-reward-shape gate on top.
  if (reward && reward.type === "crew_tiered") {
    const resolved = await resolveOperatorPlan(req);
    if (resolved && !resolved.plan.crewSystem) {
      return res.status(403).json(
        planError(
          `Crew (tiered) refer-a-friend is not available on the ${resolved.plan.name} plan — upgrade to Affiliate Pro.`,
          resolved.planKey,
          "pro",
        ),
      );
    }
  }

  const update = {
    operatorId,
    ...(typeof enabled === "boolean" ? { enabled } : {}),
    ...(reward ? { reward } : {}),
    ...(refereeReward ? { refereeReward } : {}),
    ...(recurringReward ? { recurringReward } : {}),
    ...(qualification ? { qualification } : {}),
    ...(caps ? { caps } : {}),
  };

  const config = await ReferAFriendConfig.findOneAndUpdate(
    { brandId },
    { $set: update, $setOnInsert: { brandId } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();

  return res.status(200).json({ config });
};

// ── Activity ──────────────────────────────────────────────────────────────────

// GET /api/v1/refer/referrals?brandId=&status=&limit=&before=
exports.listReferrals = async (req, res) => {
  const operatorId = operatorOnly(req, res);
  if (!operatorId) return;

  const { brandId, status, limit, before } = req.query || {};
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);

  const match = { operatorId };
  if (brandId) {
    const ownership = await loadOwnedBrand(brandId, operatorId);
    if (!ownership.ok) return res.status(ownership.status).json({ error: ownership.error });
    match.brandId = brandId;
  }
  if (status) match.status = status;
  if (before) match.createdAt = { $lt: new Date(before) };

  const referrals = await PlayerReferral.find(match)
    .sort({ createdAt: -1 })
    .limit(lim)
    .lean();

  return res.status(200).json({ referrals, count: referrals.length });
};

// GET /api/v1/refer/referrals/:id
exports.getReferral = async (req, res) => {
  const operatorId = operatorOnly(req, res);
  if (!operatorId) return;

  const referral = await PlayerReferral.findById(req.params.id).lean();
  if (!referral || String(referral.operatorId) !== operatorId) {
    return res.status(404).json({ error: "referral_not_found" });
  }

  const deliveries = await RewardDelivery.find({ referralId: referral._id })
    .sort({ createdAt: -1 })
    .lean();

  return res.status(200).json({ referral, deliveries });
};

// ── Deliveries ────────────────────────────────────────────────────────────────

// GET /api/v1/refer/deliveries?brandId=&status=&limit=&before=
exports.listDeliveries = async (req, res) => {
  const operatorId = operatorOnly(req, res);
  if (!operatorId) return;

  const { brandId, status, eventType, limit, before } = req.query || {};
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);

  const match = { operatorId };
  if (brandId) {
    const ownership = await loadOwnedBrand(brandId, operatorId);
    if (!ownership.ok) return res.status(ownership.status).json({ error: ownership.error });
    match.brandId = brandId;
  }
  if (status) match.status = status;
  if (eventType) match.eventType = eventType;
  if (before) match.createdAt = { $lt: new Date(before) };

  const deliveries = await RewardDelivery.find(match)
    .sort({ createdAt: -1 })
    .limit(lim)
    .lean();

  return res.status(200).json({ deliveries, count: deliveries.length });
};
