"use strict";

/**
 * Integration endpoints called by the operator's casino backend to feed
 * the refer-a-friend engine. Maps engine errors → HTTP responses.
 *
 * Mounted under /api/v1/refer/* — see routes/affiliate/referAFriendRoutes.js
 * for the wiring. All endpoints require an authenticated operator JWT.
 */

const mongoose           = require("mongoose");
const Brand              = require("../../models/Brand");
const PlayerReferral     = require("../../models/PlayerReferral");
const RewardDelivery     = require("../../models/RewardDelivery");
const ReferAFriendConfig = require("../../models/ReferAFriendConfig");
const engine             = require("../../engine/referralEngine");

/**
 * Resolve the operator scope from the JWT. We use the session user's
 * operatorId (the Operator tenant pointer), NOT the user's own _id.
 * Brand.operatorId — and therefore everything we scope by "operator" in
 * refer-a-friend (PlayerReferral, ReferAFriendConfig, RewardDelivery) —
 * references that tenant. brandController + fees controller follow the same
 * convention; scoping by _id wrongly rejected operators whose _id != operatorId.
 *
 * Returns null + writes the response on failure.
 */
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

/**
 * Defense-in-depth: even though the engine looks up the brand's operatorId,
 * a typo'd brandId from a different operator's tree should not partially
 * mutate state. We validate up-front.
 */
async function assertBrandOwnedByOperator(brandId, operatorId) {
  const brand = await Brand.findById(brandId).lean();
  if (!brand) return { ok: false, status: 404, error: "brand_not_found" };
  if (String(brand.operatorId) !== String(operatorId)) {
    return { ok: false, status: 403, error: "brand_not_owned_by_operator" };
  }
  return { ok: true };
}

function sendEngineError(res, err) {
  if (err && err.name === "ReferralEngineError") {
    return res.status(err.status || 400).json({ error: err.code, message: err.message });
  }
  // eslint-disable-next-line no-console
  console.error("[refer-a-friend integration] unexpected error", err);
  return res.status(500).json({ error: "internal_error" });
}

// POST /api/v1/refer/track-signup
exports.trackSignup = async (req, res) => {
  const operatorId = operatorOnly(req, res);
  if (!operatorId) return;

  const { brandId, referrerPlayerId, refereePlayerId, refCode } = req.body || {};

  const ownership = await assertBrandOwnedByOperator(brandId, operatorId);
  if (!ownership.ok) return res.status(ownership.status).json({ error: ownership.error });

  try {
    const referral = await engine.trackSignup({
      brandId,
      referrerPlayerId,
      refereePlayerId,
      refCode,
    });
    return res.status(201).json({
      referralId: String(referral._id),
      status: referral.status,
      signedUpAt: referral.signedUpAt,
    });
  } catch (err) {
    return sendEngineError(res, err);
  }
};

// POST /api/v1/refer/track-ftd
exports.trackFtd = async (req, res) => {
  const operatorId = operatorOnly(req, res);
  if (!operatorId) return;

  const {
    brandId,
    refereePlayerId,
    depositCents,
    currency,
    depositedAt,
    referrerPlayerId, // optional, FTD-only mode
    refCode,
  } = req.body || {};

  const ownership = await assertBrandOwnedByOperator(brandId, operatorId);
  if (!ownership.ok) return res.status(ownership.status).json({ error: ownership.error });

  try {
    const referral = await engine.trackFtd({
      brandId,
      refereePlayerId,
      depositCents,
      currency,
      depositedAt,
      referrerPlayerId,
      refCode,
    });
    return res.status(200).json({
      referralId: String(referral._id),
      status: referral.status,
      ftdAt: referral.ftdAt,
    });
  } catch (err) {
    return sendEngineError(res, err);
  }
};

// POST /api/v1/refer/track-ftd-reversal
exports.trackFtdReversal = async (req, res) => {
  const operatorId = operatorOnly(req, res);
  if (!operatorId) return;

  const { brandId, refereePlayerId, reversedCents, reason, reversedAt } = req.body || {};

  const ownership = await assertBrandOwnedByOperator(brandId, operatorId);
  if (!ownership.ok) return res.status(ownership.status).json({ error: ownership.error });

  try {
    const { referral, delivery } = await engine.trackFtdReversal({
      brandId,
      refereePlayerId,
      reversedCents,
      reason,
      reversedAt,
    });

    return res.status(200).json({
      referralId: String(referral._id),
      previousStatus: req.body.__prev || undefined, // engine doesn't expose; clients compare to their own state
      newStatus: referral.status,
      rewardClawback: delivery
        ? {
            rewardCents: referral.rewardCents,
            rewardCurrency: referral.rewardCurrency,
            deliveryId: String(delivery._id),
            deliveryStatus: delivery.status,
          }
        : null,
    });
  } catch (err) {
    return sendEngineError(res, err);
  }
};

// GET /api/v1/refer/stats?playerId=…&brandId=…&limit=…
//
// Player-facing summary: how many friends this player has invited, what
// status those referrals are in, and how much they've earned. Used by
// the operator's casino UI to surface a "Refer-a-Friend" widget without
// the operator having to track this themselves.
//
// Returns two payload halves:
//   asReferrer — counts + totals when this player invited others
//   asReferee  — single record (or null) when this player was invited
//                by someone else, with the welcome bonus state
//
// brandId is optional. Omitted = aggregate across every brand of this
// operator. Provided = scope to that one brand (after ownership check).
exports.getStats = async (req, res) => {
  const operatorId = operatorOnly(req, res);
  if (!operatorId) return;

  const { playerId, brandId } = req.query || {};
  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50);

  if (!playerId || typeof playerId !== "string") {
    return res.status(400).json({ error: "missing_field", message: "playerId required" });
  }
  if (brandId) {
    const ownership = await assertBrandOwnedByOperator(brandId, operatorId);
    if (!ownership.ok) return res.status(ownership.status).json({ error: ownership.error });
  }

  // operatorId/brandId are ObjectId columns and aggregate $match does NOT
  // cast strings — pass real ObjectIds. (find/distinct below cast on their own,
  // and they accept ObjectIds just as well.)
  const referrerMatch = {
    operatorId: new mongoose.Types.ObjectId(operatorId),
    referrerPlayerId: playerId,
  };
  if (brandId) referrerMatch.brandId = new mongoose.Types.ObjectId(brandId);

  // Aggregation: one pass to bucket everything by status + sum rewards.
  // Cheaper than running multiple count queries; the
  // (operatorId, referrerPlayerId) compound index keeps it fast.
  const buckets = await PlayerReferral.aggregate([
    { $match: referrerMatch },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        rewardSum: { $sum: { $ifNull: ["$rewardCents", 0] } },
      },
    },
  ]);

  const counts = {
    pending_ftd: 0,
    pending_qualification: 0,
    qualified: 0,
    rewarded: 0,
    reversed: 0,
    rejected: 0,
  };
  let totalEarnedCents   = 0;
  let totalReversedCents = 0;
  for (const b of buckets) {
    counts[b._id] = b.count;
    if (b._id === "rewarded") totalEarnedCents   += b.rewardSum;
    if (b._id === "reversed") totalReversedCents += b.rewardSum;
  }

  // Recent referrals — last N rows for "show me who I invited" widgets.
  // Use lean + select so we don't ship the configSnapshot blob to the
  // casino UI.
  const recent = await PlayerReferral.find(referrerMatch)
    .sort({ createdAt: -1 })
    .limit(limit)
    .select({
      refereePlayerId: 1,
      status: 1,
      signedUpAt: 1,
      ftdAt: 1,
      qualifiedAt: 1,
      rewardCents: 1,
      rewardCurrency: 1,
      createdAt: 1,
    })
    .lean();

  // Common currency: if all rewarded rewards share a currency, expose
  // it as a hint for the UI's display formatter. If mixed (rare), null.
  const distinctCurrencies = await PlayerReferral.distinct("rewardCurrency", {
    ...referrerMatch,
    rewardCurrency: { $ne: null },
  });
  const currency = distinctCurrencies.length === 1 ? distinctCurrencies[0] : null;

  // asReferee — single row at most, by uniqueness invariant
  // (operatorId, refereePlayerId) is unique on PlayerReferral.
  const refereeRow = await PlayerReferral.findOne({
    operatorId,
    refereePlayerId: playerId,
  })
    .select({
      brandId: 1,
      referrerPlayerId: 1,
      status: 1,
      signedUpAt: 1,
      ftdAt: 1,
      qualifiedAt: 1,
      refereeRewardCents: 1,
      refereeRewardCurrency: 1,
      refereeRewardedAt: 1,
    })
    .lean();

  return res.status(200).json({
    asReferrer: {
      invited:            (counts.pending_ftd
                          + counts.pending_qualification
                          + counts.qualified
                          + counts.rewarded
                          + counts.reversed
                          + counts.rejected),
      pending:            counts.pending_ftd + counts.pending_qualification,
      qualified:          counts.qualified + counts.rewarded + counts.reversed,
      rewarded:           counts.rewarded,
      reversed:           counts.reversed,
      rejected:           counts.rejected,
      totalEarnedCents,
      totalReversedCents,
      netEarnedCents:     totalEarnedCents - totalReversedCents,
      currency,
      recentReferrals:    recent,
    },
    asReferee: refereeRow
      ? {
          brandId: String(refereeRow.brandId),
          referrerPlayerId: refereeRow.referrerPlayerId,
          status: refereeRow.status,
          signedUpAt: refereeRow.signedUpAt,
          ftdAt: refereeRow.ftdAt,
          qualifiedAt: refereeRow.qualifiedAt,
          refereeRewardCents: refereeRow.refereeRewardCents,
          refereeRewardCurrency: refereeRow.refereeRewardCurrency,
          refereeRewardedAt: refereeRow.refereeRewardedAt,
        }
      : null,
  });
};

// GET /api/v1/refer/player/:playerId/referrals?limit=
//
// Per-friend view: every PlayerReferral where this player is the
// referrer, with status, timestamps, computed reward (amount + kind),
// and — when there is a pending RewardDelivery — the deliveryId the
// FE can pass to /rewards/claim. Used by the casino "Refer a Friend"
// page to render the friend list with an inline Claim button.
exports.listPlayerReferrals = async (req, res) => {
  const operatorId = operatorOnly(req, res);
  if (!operatorId) return;

  const { playerId } = req.params;
  if (!playerId) {
    return res.status(400).json({ error: "missing_player_id" });
  }
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);

  const referrals = await PlayerReferral.find({
    operatorId,
    referrerPlayerId: playerId,
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .select({
      refereePlayerId: 1,
      status: 1,
      signedUpAt: 1,
      ftdAt: 1,
      qualifiedAt: 1,
      rewardCents: 1,
      rewardCurrency: 1,
      rewardedAt: 1,
      reversedAt: 1,
      configSnapshot: 1,
      recurringPayments: 1,
      createdAt: 1,
    })
    .lean();

  // Resolve the matching pending delivery (if any) per referral so the
  // FE can pass its id straight to /rewards/claim. One query, then map.
  const referralIds = referrals.map((r) => String(r._id));
  const pendingDeliveries = referralIds.length
    ? await RewardDelivery.find({
        operatorId,
        referralId: { $in: referralIds },
        eventType: {
          $in: [
            "referral.reward.issued",
            "referral.reward.recurring.issued",
          ],
        },
        status: "pending",
      })
        .select({ referralId: 1, eventType: 1, createdAt: 1 })
        .lean()
    : [];
  const pendingByReferral = new Map();
  for (const d of pendingDeliveries) {
    // Keep the oldest pending — usually only one exists per referral.
    const key = String(d.referralId);
    if (!pendingByReferral.has(key)) {
      pendingByReferral.set(key, d);
    }
  }

  // Live current-month NGR per referee, straight from ClickHouse, so the FE
  // can show each friend's real NGR even while the referral is still
  // pending_ftd / pending_qualification — the recurringPayments ledger only
  // fills once a referral is 'rewarded' and the monthly job runs, so without
  // this every un-rewarded friend would read €0. Uses the brand's crew metric
  // (from the qualify-time snapshot); fetchCrewMonthlyBasePerReferee swallows
  // any ClickHouse hiccup and returns an empty map.
  const ngrMetric =
    (referrals[0] &&
      referrals[0].configSnapshot &&
      referrals[0].configSnapshot.reward &&
      referrals[0].configSnapshot.reward.crewMetric) ||
    "ngr";
  const now = new Date();
  const liveNgrByReferee = await engine.fetchCrewMonthlyBasePerReferee({
    operatorId,
    refereePlayerIds: referrals.map((r) => r.refereePlayerId),
    year: now.getUTCFullYear(),
    month: now.getUTCMonth() + 1,
    ngrMetric,
  });

  const rows = referrals.map((r) => {
    const pending = pendingByReferral.get(String(r._id));
    // Crew recurring breakdown: this referee's NGR × tier% accrued monthly.
    // For crew the one-shot rewardCents is 0, so the FE should show these.
    const rp = Array.isArray(r.recurringPayments) ? r.recurringPayments : [];
    const latest = rp.length ? rp[rp.length - 1] : null;
    return {
      referralId: String(r._id),
      refereePlayerId: r.refereePlayerId,
      status: r.status,
      signedUpAt: r.signedUpAt,
      ftdAt: r.ftdAt,
      qualifiedAt: r.qualifiedAt,
      rewardedAt: r.rewardedAt || null,
      reversedAt: r.reversedAt || null,
      rewardCents: r.rewardCents || 0,
      rewardCurrency: r.rewardCurrency || null,
      rewardKind:
        (r.configSnapshot &&
          r.configSnapshot.reward &&
          r.configSnapshot.reward.rewardKind) ||
        null,
      recurringNgrCents: rp.reduce((s, p) => s + (Number(p.ngrCents) || 0), 0),
      // Live current-month NGR (signed, netted) regardless of referral status —
      // the FE shows this when there's no accrued recurring NGR yet.
      currentNgrCents: liveNgrByReferee.get(String(r.refereePlayerId)) || 0,
      recurringRewardCents: rp.reduce((s, p) => s + (Number(p.rewardCents) || 0), 0),
      recurringPercent: latest ? (latest.percent ?? null) : null,
      pendingDeliveryId: pending ? String(pending._id) : null,
      createdAt: r.createdAt,
    };
  });

  return res.status(200).json({ referrals: rows, count: rows.length });
};

// GET /api/v1/refer/player/:playerId/rewards?limit=
//
// Pull-model ledger: returns every refer-a-friend reward owed to (or
// recently paid out to) a given player on the operator's side. The
// casino backend polls this when a player visits their "My Rewards"
// page, credits the wallet for every `pending` row, then ACKs via
// /claim below so the same reward isn't paid twice.
//
// A reward concerns a player when either:
//   • the recipient field for that event type matches the player, OR
//   • for the four reversal/forward-pair event types, the same player
//     id appears in the matching role inside the snapshotted payload.
//
// Returns { pending, history }.
// `history` is the last `limit` (default 20, max 200) already-claimed
// rows in descending deliveredAt order. `pending` is unbounded but
// in practice tiny.
exports.listPlayerRewards = async (req, res) => {
  const operatorId = operatorOnly(req, res);
  if (!operatorId) return;

  const { playerId } = req.params;
  if (!playerId) {
    return res.status(400).json({ error: "missing_player_id" });
  }
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 200);

  // Match on the recipient field embedded in the payload. The pair-of-
  // event-types convention means we can resolve recipient cheaply with
  // a $or against the two ids — the eventType field then narrows to
  // the right side, but matching either id is fine because operator-
  // scoping below catches mistakes.
  const match = {
    operatorId,
    $or: [
      // referrer-side events (issued / reversed / recurring.issued)
      {
        eventType: {
          $in: [
            "referral.reward.issued",
            "referral.reward.reversed",
            "referral.reward.recurring.issued",
          ],
        },
        "payload.data.referrerPlayerId": playerId,
      },
      // referee-side events (referee.issued / referee.reversed)
      {
        eventType: {
          $in: [
            "referral.reward.referee.issued",
            "referral.reward.referee.reversed",
          ],
        },
        "payload.data.refereePlayerId": playerId,
      },
    ],
  };

  const [pendingRaw, historyRaw] = await Promise.all([
    RewardDelivery.find({ ...match, status: "pending" })
      .sort({ createdAt: 1 })
      .lean(),
    RewardDelivery.find({ ...match, status: "delivered" })
      .sort({ deliveredAt: -1 })
      .limit(limit)
      .lean(),
  ]);

  return res.status(200).json({
    pending: pendingRaw.map(serializeReward),
    history: historyRaw.map(serializeReward),
  });
};

// GET /api/v1/refer/player/:playerId/crew?brandId=<optional>
//
// Crew dashboard payload the operator's player frontend renders for the
// invite page: current level, progress to next, lifetime/pending/available
// earnings. Operator-auth (same as the other /player/:id endpoints) — the
// casino backend proxies this to its own players.
//
// `currentLevel` and `nextLevel` are only meaningful when the brand's
// reward.type === "crew_tiered". For other reward shapes the level fields
// come back null but the earnings summary still works.
exports.getPlayerCrew = async (req, res) => {
  const operatorId = operatorOnly(req, res);
  if (!operatorId) return;

  const { playerId } = req.params;
  if (!playerId) return res.status(400).json({ error: "missing_player_id" });

  const brandId = req.query && req.query.brandId;
  const cfgFilter = { operatorId };
  if (brandId) cfgFilter.brandId = brandId;

  // First enabled config for this operator if no brandId is given — the
  // common single-brand case.
  const config = await ReferAFriendConfig.findOne(cfgFilter)
    .sort({ enabled: -1, updatedAt: -1 })
    .lean();
  if (!config) return res.status(404).json({ error: "config_not_found" });

  const isCrew = config.reward && config.reward.type === "crew_tiered";

  // Active crew count = referrer's rewarded referrals on this brand.
  const referralFilter = {
    operatorId,
    referrerPlayerId: playerId,
    status: "rewarded",
    brandId: config.brandId,
  };
  const activeReferralsCount = await PlayerReferral.countDocuments(referralFilter);

  // Resolve current + next tier (only meaningful for crew_tiered). Each tier
  // carries a 1-based `levelNumber` from its sorted position and the operator's
  // `name`; a referrer below the first threshold is Level 0 (currentLevel null).
  let currentLevel = null;
  let nextLevel = null;
  let currentPercent = 0;
  let currentLevelNumber = 0;
  if (isCrew && Array.isArray(config.reward.crewLevels)) {
    const sorted = [...config.reward.crewLevels].sort(
      (a, b) => a.activeReferrals - b.activeReferrals,
    );
    sorted.forEach((lvl, i) => {
      const levelNumber = i + 1;
      const shaped = {
        levelNumber,
        name: lvl.name || "",
        activeReferrals: lvl.activeReferrals,
        percent: lvl.percent,
      };
      if (activeReferralsCount >= (Number(lvl.activeReferrals) || 0)) {
        currentLevel = shaped;
        currentPercent = Number(lvl.percent) || 0;
        currentLevelNumber = levelNumber;
      } else if (!nextLevel) {
        nextLevel = shaped;
      }
    });
  }

  // Earnings: aggregate over RewardDelivery for the referrer side. The
  // referee-side events go to the friend, not the referrer — exclude.
  // Reversals subtract from lifetime so a clawed-back FTD doesn't pad
  // a referrer's "lifetime" history.
  const baseMatch = {
    // aggregate $match does not cast — operatorId is an ObjectId column.
    operatorId: new mongoose.Types.ObjectId(operatorId),
    brandId: config.brandId,
    "payload.data.referrerPlayerId": playerId,
  };
  const RES_EVENTS = ["referral.reward.issued", "referral.reward.recurring.issued"];
  const REV_EVENTS = ["referral.reward.reversed"];

  const [pendingAgg, deliveredAgg, reversedAgg] = await Promise.all([
    RewardDelivery.aggregate([
      { $match: { ...baseMatch, status: "pending",   eventType: { $in: RES_EVENTS } } },
      { $group: { _id: null, cents: { $sum: "$payload.data.rewardCents" } } },
    ]),
    RewardDelivery.aggregate([
      { $match: { ...baseMatch, status: "delivered", eventType: { $in: RES_EVENTS } } },
      { $group: { _id: null, cents: { $sum: "$payload.data.rewardCents" } } },
    ]),
    RewardDelivery.aggregate([
      { $match: { ...baseMatch, status: "delivered", eventType: { $in: REV_EVENTS } } },
      { $group: { _id: null, cents: { $sum: "$payload.data.rewardCents" } } },
    ]),
  ]);
  const pendingCents   = pendingAgg[0]?.cents   || 0;
  const deliveredCents = deliveredAgg[0]?.cents || 0;
  const reversedCents  = reversedAgg[0]?.cents  || 0;

  return res.status(200).json({
    brandId: String(config.brandId),
    rewardType: config.reward?.type ?? null,
    activeReferralsCount,
    currentLevel,                  // { levelNumber, name, activeReferrals, percent } or null
    currentLevelNumber,            // 0 when below the first threshold (Level 0)
    nextLevel,                     // null when at the top tier
    currentPercent,                // 0 if below the first threshold
    progressToNext: nextLevel
      ? {
          current:   activeReferralsCount,
          target:    nextLevel.activeReferrals,
          remaining: Math.max(0, nextLevel.activeReferrals - activeReferralsCount),
        }
      : null,
    metric: config.reward?.crewMetric ?? null,
    earnings: {
      pendingCents,                                       // not yet delivered to wallet
      availableCents: Math.max(0, deliveredCents - reversedCents),  // in-wallet balance
      lifetimeCents:  Math.max(0, deliveredCents - reversedCents) + pendingCents, // total ever earned (net of reversals)
      currency: config.reward?.currency ?? "EUR",
    },
  });
};

// GET /api/v1/refer/settings?brandId=<optional>
//
// Player-facing "plan" for a brand: the reward shape the operator's player
// frontend renders on its refer-a-friend page (reward type, percent/amount,
// tier ladder, two-sided + recurring rewards). The casino backend proxies
// this to its players, so it deliberately omits operator-internal config —
// qualification gates, anti-abuse signals, and spend caps never leave Affiliar.
//
// Operator-auth (same as the other integration endpoints). With no brandId
// the first enabled config for the operator is returned (single-brand case).
exports.getSettings = async (req, res) => {
  const operatorId = operatorOnly(req, res);
  if (!operatorId) return;

  const brandId = req.query && req.query.brandId;

  // A brand-specific config wins; failing that we fall back to the operator's
  // brandId:null row, which is what that row means — the default for every
  // brand that hasn't been given its own.
  //
  // Without the fallback a caller that sends its brandId gets 404 whenever the
  // operator configured refer-a-friend at the operator level, and the casino
  // renders an empty crew page with nothing in any log to explain it.
  let config = null;
  if (brandId) {
    config = await ReferAFriendConfig.findOne({ operatorId, brandId })
      .sort({ enabled: -1, updatedAt: -1 })
      .lean();
  }
  if (!config) {
    config = await ReferAFriendConfig.findOne({ operatorId, brandId: null })
      .sort({ enabled: -1, updatedAt: -1 })
      .lean();
  }
  if (!config && !brandId) {
    config = await ReferAFriendConfig.findOne({ operatorId })
      .sort({ enabled: -1, updatedAt: -1 })
      .lean();
  }
  if (!config) return res.status(404).json({ error: "config_not_found" });

  const reward = config.reward || {};
  const refereeReward = config.refereeReward || {};
  const recurringReward = config.recurringReward || {};

  return res.status(200).json({
    brandId: String(config.brandId),
    enabled: !!config.enabled,
    reward: {
      type: reward.type ?? null,
      amountCents: reward.amountCents ?? 0,
      percent: reward.percent ?? 0,
      capCents: reward.capCents ?? null,
      currency: reward.currency ?? "EUR",
      rewardKind: reward.rewardKind ?? null,
      // Tier ladder + metric only carry meaning for crew_tiered, but we
      // always send them so the frontend can render the full ladder.
      crewLevels: Array.isArray(reward.crewLevels)
        ? reward.crewLevels.map((l) => ({
            activeReferrals: l.activeReferrals,
            percent: l.percent,
            // Named tiers + level number so the FE can label the ladder
            // ("Bronze", "Silver"…) instead of just a percent row.
            levelNumber: l.levelNumber ?? null,
            name: l.name ?? null,
          }))
        : [],
      crewMetric: reward.crewMetric ?? null,
      crewMonthlyCapCents: reward.crewMonthlyCapCents ?? null,
    },
    // Only surface the friend's welcome bonus when the operator turned it on.
    refereeReward: refereeReward.enabled
      ? {
          enabled: true,
          type: refereeReward.type ?? null,
          amountCents: refereeReward.amountCents ?? 0,
          percent: refereeReward.percent ?? 0,
          capCents: refereeReward.capCents ?? null,
          rewardKind: refereeReward.rewardKind ?? null,
        }
      : { enabled: false },
    // Recurring %-of-NGR share, when enabled.
    recurringReward: recurringReward.enabled
      ? {
          enabled: true,
          percent: recurringReward.percent ?? 0,
          ngrMetric: recurringReward.ngrMetric ?? null,
          durationMonths: recurringReward.durationMonths ?? null,
          monthlyCapCents: recurringReward.monthlyCapCents ?? null,
          rewardKind: recurringReward.rewardKind ?? null,
        }
      : { enabled: false },
  });
};

// POST /api/v1/refer/player/:playerId/rewards/claim
//
// Casino backend posts this after it has credited (or debited, for
// reversal events) the player's wallet. Each id in the body is flipped
// from `pending` to `delivered` (with deliveredAt=now) and the
// matching referral state cascade runs (the same one the old webhook
// worker used to run on a 2xx). Idempotent — already-`delivered` rows
// are skipped.
//
// Returns { claimed: [ids…], skipped: [{ id, reason }] }.
exports.claimPlayerRewards = async (req, res) => {
  const operatorId = operatorOnly(req, res);
  if (!operatorId) return;

  const { playerId } = req.params;
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : null;
  if (!playerId) return res.status(400).json({ error: "missing_player_id" });
  if (!ids || ids.length === 0) {
    return res.status(400).json({ error: "missing_ids", message: "body.ids must be a non-empty array" });
  }
  if (ids.length > 200) {
    return res.status(400).json({ error: "too_many_ids", message: "max 200 ids per request" });
  }

  const claimed = [];
  const skipped = [];

  for (const rawId of ids) {
    let delivery;
    try {
      delivery = await RewardDelivery.findById(rawId);
    } catch (_) {
      skipped.push({ id: String(rawId), reason: "invalid_id" });
      continue;
    }
    if (!delivery) {
      skipped.push({ id: String(rawId), reason: "not_found" });
      continue;
    }
    if (String(delivery.operatorId) !== operatorId) {
      skipped.push({ id: String(rawId), reason: "not_owned" });
      continue;
    }

    // Defense-in-depth: make sure the reward really belongs to this
    // player (matches the payload's recipient field). Prevents an
    // operator from claiming Player A's reward while passing Player B
    // in the URL.
    const data = (delivery.payload && delivery.payload.data) || {};
    const isRefereeEvent = String(delivery.eventType).startsWith(
      "referral.reward.referee.",
    );
    const expectedPlayer = isRefereeEvent
      ? data.refereePlayerId
      : data.referrerPlayerId;
    if (String(expectedPlayer) !== String(playerId)) {
      skipped.push({ id: String(rawId), reason: "player_mismatch" });
      continue;
    }

    if (delivery.status === "delivered") {
      skipped.push({ id: String(rawId), reason: "already_claimed" });
      continue;
    }
    if (delivery.status !== "pending") {
      skipped.push({ id: String(rawId), reason: `invalid_state_${delivery.status}` });
      continue;
    }

    delivery.status = "delivered";
    delivery.deliveredAt = new Date();
    await delivery.save();
    await engine.applyDeliveryAck(delivery);

    claimed.push(String(delivery._id));
  }

  return res.status(200).json({ claimed, skipped });
};

// Internal — shape RewardDelivery rows for the FE / casino BE.
function serializeReward(row) {
  const data = (row.payload && row.payload.data) || {};
  const isRefereeEvent = String(row.eventType).startsWith(
    "referral.reward.referee.",
  );
  return {
    id: String(row._id),
    eventType: row.eventType,
    referralId: data.referralId || null,
    recipientPlayerId: isRefereeEvent
      ? data.refereePlayerId
      : data.referrerPlayerId,
    rewardCents: data.rewardCents || 0,
    rewardCurrency: data.rewardCurrency || null,
    rewardKind: data.rewardKind || null,
    qualifiedAt: data.qualifiedAt || null,
    // Reversed events carry these for clarity in the dashboard.
    reversedAt: data.reversedAt || null,
    reversalReason: data.reversalReason || null,
    // Recurring period info, when present.
    period: data.period || null,
    ngrCents: data.ngrCents || null,
    // Crew (tiered) rewards carry the referrer's current level so the
    // operator can show the tier alongside the amount. null otherwise.
    crew: data.crew || null,
    createdAt: row.createdAt,
    deliveredAt: row.deliveredAt || null,
  };
}
