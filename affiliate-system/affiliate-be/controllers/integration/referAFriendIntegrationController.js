"use strict";

/**
 * Integration endpoints called by the operator's casino backend to feed
 * the refer-a-friend engine. Maps engine errors → HTTP responses.
 *
 * Mounted under /api/v1/refer/* — see routes/affiliate/referAFriendRoutes.js
 * for the wiring. All endpoints require an authenticated operator JWT.
 */

const Brand = require("../../models/Brand");
const engine = require("../../engine/referralEngine");

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
