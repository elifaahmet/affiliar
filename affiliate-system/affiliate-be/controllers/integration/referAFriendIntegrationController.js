"use strict";

/**
 * Integration endpoints called by the operator's casino backend to feed
 * the refer-a-friend engine. Maps engine errors → HTTP responses.
 *
 * Mounted under /api/v1/refer/* — see routes/affiliate/referAFriendRoutes.js
 * for the wiring. All endpoints require an authenticated operator JWT.
 */

const Brand          = require("../../models/Brand");
const PlayerReferral = require("../../models/PlayerReferral");
const engine         = require("../../engine/referralEngine");

/** Resolve the operator behind the JWT. Returns null + writes the response on failure. */
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

  const referrerMatch = { operatorId, referrerPlayerId: playerId };
  if (brandId) referrerMatch.brandId = brandId;

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
