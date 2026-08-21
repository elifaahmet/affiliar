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

const mongoose           = require("mongoose");
const Brand              = require("../../models/Brand");
const { attachPlayerUsernames } = require("../../utils/playerNames");
const ReferAFriendConfig = require("../../models/ReferAFriendConfig");
const PlayerReferral     = require("../../models/PlayerReferral");
const RewardDelivery     = require("../../models/RewardDelivery");
const AffiliatePlayer    = require("../../models/AffiliatePlayer");
const engine             = require("../../engine/referralEngine");
const {
  resolveOperatorPlan, planError,
} = require("../../middlewares/planGuard");

// ── Auth helpers ──────────────────────────────────────────────────────────────

// We scope refer-a-friend by the session user's operatorId (the Operator
// tenant pointer). Brand.operatorId references that tenant, NOT the owner
// user's _id — brandController and feesController follow the same convention,
// so scoping by _id here wrongly rejected operators whose _id != operatorId.
function operatorOnly(req, res) {
  const user = req.affiliateUser;
  if (!user || user.role !== "operator") {
    res.status(403).json({ error: "Operator authentication required" });
    return null;
  }
  if (!user.operatorId) {
    res.status(403).json({ error: "No operator linked to account" });
    return null;
  }
  return String(user.operatorId);
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

  const rows = await PlayerReferral.find(match)
    .sort({ createdAt: -1 })
    .limit(lim)
    .lean();

  // Surface the recurring (crew) earnings breakdown per row so the activity
  // table can show NGR × tier% = reward for each referee. For crew the
  // per-referral one-shot rewardCents is 0 by design; the real money is the
  // sum of this referee's recurringPayments. `recurringLatest` is the most
  // recent month's row (NGR + percent + reward); the totals are lifetime.
  const referrals = rows.map((r) => {
    const rp = Array.isArray(r.recurringPayments) ? r.recurringPayments : [];
    const latest = rp.length ? rp[rp.length - 1] : null;
    return {
      ...r,
      recurringNgrCents: rp.reduce((s, p) => s + (Number(p.ngrCents) || 0), 0),
      recurringRewardCents: rp.reduce((s, p) => s + (Number(p.rewardCents) || 0), 0),
      recurringPercent: latest ? (latest.percent ?? null) : null,
      recurringLatest: latest
        ? {
            year: latest.year,
            month: latest.month,
            ngrCents: latest.ngrCents,
            percent: latest.percent ?? null,
            rewardCents: latest.rewardCents,
          }
        : null,
    };
  });

  // Both sides of a referral are casino player ids; without their names the
  // activity table is a wall of hex.
  await attachPlayerUsernames(operatorId, referrals, [
    "referrerPlayerId",
    "refereePlayerId",
  ]);

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

// ── Admin: crew leaderboard + fraud + manual transitions ─────────────────────

// GET /api/v1/refer/admin/top-referrers?brandId=&limit=&sort=active|earnings
// Aggregates PlayerReferral by referrerPlayerId to surface who's bringing in
// the biggest active crews. Default `sort=active` ranks by count of
// `status: rewarded` referrals (= the crew size that drives the Crew tier);
// `sort=earnings` ranks by sum of issued + recurring rewards.
exports.listTopReferrers = async (req, res) => {
  const operatorId = operatorOnly(req, res);
  if (!operatorId) return;

  const { brandId, limit, sort = "active" } = req.query || {};
  const lim = Math.min(Math.max(Number(limit) || 20, 1), 100);

  // aggregate $match does not cast — operatorId/brandId are ObjectId columns.
  const match = { operatorId: new mongoose.Types.ObjectId(operatorId) };
  if (brandId) {
    const ownership = await loadOwnedBrand(brandId, operatorId);
    if (!ownership.ok) return res.status(ownership.status).json({ error: ownership.error });
    match.brandId = new mongoose.Types.ObjectId(brandId);
  }

  const rows = await PlayerReferral.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$referrerPlayerId",
        totalReferrals: { $sum: 1 },
        activeReferrals: {
          $sum: { $cond: [{ $eq: ["$status", "rewarded"] }, 1, 0] },
        },
        pendingReferrals: {
          $sum: {
            $cond: [
              { $in: ["$status", ["pending_ftd", "pending_qualification", "qualified"]] },
              1, 0,
            ],
          },
        },
        rewardCents: { $sum: { $ifNull: ["$rewardCents", 0] } },
        recurringCents: {
          $sum: {
            $reduce: {
              input: { $ifNull: ["$recurringPayments", []] },
              initialValue: 0,
              in: { $add: ["$$value", { $ifNull: ["$$this.rewardCents", 0] }] },
            },
          },
        },
        lastActivityAt: { $max: { $ifNull: ["$rewardedAt", "$qualifiedAt", "$ftdAt", "$signedUpAt"] } },
      },
    },
    {
      $project: {
        _id: 0,
        referrerPlayerId: "$_id",
        totalReferrals: 1,
        activeReferrals: 1,
        pendingReferrals: 1,
        earningsCents: { $add: ["$rewardCents", "$recurringCents"] },
        lastActivityAt: 1,
      },
    },
    {
      $sort:
        sort === "earnings"
          ? { earningsCents: -1, activeReferrals: -1 }
          : { activeReferrals: -1, earningsCents: -1 },
    },
    { $limit: lim },
  ]);

  // Same reason as the activity table: this is the crew leaderboard, and a
  // leaderboard of player ids tells the operator nothing.
  await attachPlayerUsernames(operatorId, rows, ["referrerPlayerId"]);

  return res.status(200).json({ referrers: rows, count: rows.length });
};

// GET /api/v1/refer/admin/fraud-flagged?limit=&before=
// Lists AffiliatePlayer rows where fraudFlagged is true (set by
// rawEventIngest on player.flagged events). Operator-scoped.
exports.listFraudFlagged = async (req, res) => {
  const operatorId = operatorOnly(req, res);
  if (!operatorId) return;

  const { limit, before } = req.query || {};
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);

  const match = { operatorId, fraudFlagged: true };
  if (before) match.lastFraudFlagAt = { $lt: new Date(before) };

  const rows = await AffiliatePlayer.find(match)
    .select({
      playerId: 1, brandId: 1, lastFraudFlag: 1, lastFraudFlagAt: 1,
      registeredAt: 1, country: 1,
    })
    .sort({ lastFraudFlagAt: -1 })
    .limit(lim)
    .lean();

  return res.status(200).json({ players: rows, count: rows.length });
};

// Shared helper: load a referral that belongs to the operator. Returns the
// doc or null + writes the 404 — the caller short-circuits on null.
async function loadOwnReferral(req, res) {
  const operatorId = operatorOnly(req, res);
  if (!operatorId) return null;
  const referral = await PlayerReferral.findOne({
    _id: req.params.id,
    operatorId,
  });
  if (!referral) {
    res.status(404).json({ error: "referral_not_found" });
    return null;
  }
  return referral;
}

// POST /api/v1/refer/admin/referrals/:id/approve
// Force a referral past pending_qualification straight to the engine's
// reward flow. Useful when the operator manually verified a player who
// would otherwise sit pending on the wager / age / NGR gates. The engine's
// cap + reward computation still runs, so this is "skip gates", not "skip
// limits".
exports.approveReferral = async (req, res) => {
  const referral = await loadOwnReferral(req, res);
  if (!referral) return;

  if (!["pending_ftd", "pending_qualification", "qualified"].includes(referral.status)) {
    return res.status(409).json({ error: "not_pending", status: referral.status });
  }
  if (referral.frozen) {
    return res.status(409).json({ error: "referral_frozen" });
  }

  // pending_ftd referrals haven't even hit FTD yet — operator can override
  // by injecting an FTD via track-ftd. Approving without an FTD doesn't
  // make sense; surface that explicitly rather than silently rewarding 0.
  if (referral.status === "pending_ftd" || !referral.ftdAt) {
    return res.status(409).json({ error: "no_ftd_recorded" });
  }

  try {
    // Prefer an engine-side helper if one is wired up (handles reward
    // computation + delivery enqueue end-to-end). If not, fall through to
    // the simple status flip — the next recurring run picks it up and the
    // operator can drive a manual delivery from the deliveries table.
    if (typeof engine.manualApprove === "function") {
      const updated = await engine.manualApprove(referral._id, {
        actor: req.affiliateUser?._id,
      });
      if (updated) return res.status(200).json({ referral: updated });
    }

    referral.status = "qualified";
    referral.qualifiedAt = referral.qualifiedAt || new Date();
    referral.rejectionReason = null;
    await referral.save();
    return res.status(200).json({ referral: referral.toObject() });
  } catch (err) {
    return res.status(500).json({ error: err?.message || "approve_failed" });
  }
};

// POST /api/v1/refer/admin/referrals/:id/reject
// Body: { reason }. Hard-reject a referral. Already-rewarded rows aren't
// undone (use the existing trackFtdReversal path for that) — this is the
// "we're not going to pay this one" stamp on something in-flight.
exports.rejectReferral = async (req, res) => {
  const referral = await loadOwnReferral(req, res);
  if (!referral) return;

  if (["rewarded", "reversed", "rejected"].includes(referral.status)) {
    return res.status(409).json({ error: "terminal_status", status: referral.status });
  }
  const reason = String((req.body && req.body.reason) || "manual_reject").slice(0, 120);
  referral.status = "rejected";
  referral.rejectionReason = reason;
  await referral.save();
  return res.status(200).json({ referral: referral.toObject() });
};

// POST /api/v1/refer/admin/referrals/:id/freeze
// Body: { frozen: boolean, reason? }. Pauses (or resumes) a referral. While
// frozen the qualification + recurring jobs skip it; the freeze is
// orthogonal to status so the referral resumes from wherever it was when
// unfrozen.
exports.setReferralFrozen = async (req, res) => {
  const referral = await loadOwnReferral(req, res);
  if (!referral) return;

  const wantFrozen = !!(req.body && req.body.frozen);
  if (["reversed", "rejected"].includes(referral.status)) {
    return res.status(409).json({ error: "terminal_status", status: referral.status });
  }

  referral.frozen = wantFrozen;
  if (wantFrozen) {
    referral.frozenAt = new Date();
    referral.frozenReason = String(
      (req.body && req.body.reason) || "manual_freeze",
    ).slice(0, 120);
  } else {
    referral.frozenAt = null;
    referral.frozenReason = null;
  }
  await referral.save();
  return res.status(200).json({ referral: referral.toObject() });
};
