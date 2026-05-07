"use strict";

/**
 * Refer-a-Friend orchestrator. Mediates between integration controllers
 * (track-signup / track-ftd / track-ftd-reversal), the qualification job,
 * and the outbound delivery worker.
 *
 * No imports from the affiliate program engines — kept compile-time
 * isolated so changes there cannot regress refer-a-friend, and vice
 * versa. The qualification math lives in referralQualification.js
 * (pure); this file handles all DB / ClickHouse I/O.
 *
 * See docs/refer-a-friend/SPEC.md §4–§5 for the lifecycle and entry
 * points; docs/refer-a-friend/INTEGRATION.md for HTTP semantics.
 */

const crypto = require("crypto");

const Brand               = require("../models/Brand");
const ReferAFriendConfig  = require("../models/ReferAFriendConfig");
const PlayerReferral      = require("../models/PlayerReferral");
const RewardDelivery      = require("../models/RewardDelivery");
const AffiliatePlayer     = require("../models/AffiliatePlayer");

const { evaluateGates, computeReward } = require("./referralQualification");

// ── Errors ────────────────────────────────────────────────────────────────────

/**
 * Custom error class so controllers can map engine errors → HTTP codes
 * without sniffing message strings. `status` is the HTTP status to return.
 */
class ReferralEngineError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = "ReferralEngineError";
    this.code = code;
    this.status = status;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Create a referral when a friend signs up via a referrer's code.
 * Idempotent on (operatorId, refereePlayerId) — re-calling with the same
 * payload returns the existing referral.
 *
 * Throws ReferralEngineError on validation / business-rule failures:
 *   self_referral (409), duplicate_referee (409), brand_not_found (404),
 *   feature_disabled (403), referee_is_affiliate (403),
 *   conflicting_referrer (409).
 */
async function trackSignup({ brandId, referrerPlayerId, refereePlayerId, refCode }) {
  if (!brandId || !referrerPlayerId || !refereePlayerId) {
    throw new ReferralEngineError("missing_field", "brandId, referrerPlayerId, refereePlayerId required", 400);
  }

  if (referrerPlayerId === refereePlayerId) {
    throw new ReferralEngineError("self_referral", "a player cannot refer themselves", 409);
  }

  const { config, operatorId } = await loadEnabledConfig(brandId);

  // Idempotency / cross-brand uniqueness. Any prior referral for this
  // (operator, referee) — same brand, different brand, any state —
  // disqualifies a new attribution.
  const existing = await PlayerReferral.findOne({ operatorId, refereePlayerId });
  if (existing) {
    if (existing.referrerPlayerId !== referrerPlayerId) {
      throw new ReferralEngineError(
        "conflicting_referrer",
        "this player is already a referee under a different referrer",
        409,
      );
    }
    return existing; // idempotent replay
  }

  // Affiliate precedence: if the player is already attributed to an
  // affiliate (any brand of this operator), the affiliate program owns
  // them — we must not stack a refer-a-friend reward on top.
  const attributed = await AffiliatePlayer.findOne({
    operatorId,
    playerId: refereePlayerId,
    affiliateId: { $ne: null },
  });
  if (attributed) {
    throw new ReferralEngineError(
      "referee_is_affiliate",
      "referee is already attributed to an affiliate; affiliate program takes precedence",
      403,
    );
  }

  const referral = await PlayerReferral.create({
    brandId: config.brandId,
    operatorId,
    referrerPlayerId,
    refereePlayerId,
    refCode: refCode || null,
    status: "pending_ftd",
    signedUpAt: new Date(),
  });

  return referral;
}

/**
 * Record the referee's first deposit. Transitions the referral to
 * pending_qualification and immediately runs evaluateQualification —
 * this lets the rare "all gates clear at FTD" case (no holdDays, no
 * wager floor) reward the referrer instantly.
 *
 * Idempotent: a second call on a referee already in pending_qualification
 * (or beyond) returns the current state without altering ftdAt.
 *
 * Supports an "FTD-only" mode: if the referee has no prior referral row
 * (no track-signup was ever called) but `referrerPlayerId` is included
 * in the payload, the referral is created fresh and immediately
 * transitioned to pending_qualification.
 */
async function trackFtd({
  brandId,
  refereePlayerId,
  depositCents,
  currency,
  depositedAt,
  referrerPlayerId,   // optional, only used in FTD-only mode
  refCode,            // optional metadata
}) {
  if (!brandId || !refereePlayerId || !depositCents) {
    throw new ReferralEngineError("missing_field", "brandId, refereePlayerId, depositCents required", 400);
  }

  const { operatorId } = await loadEnabledConfig(brandId);

  let referral = await PlayerReferral.findOne({ operatorId, refereePlayerId });

  if (!referral) {
    // FTD-only mode — create the referral on the fly.
    if (!referrerPlayerId) {
      throw new ReferralEngineError(
        "referral_not_found",
        "no referral on file for this referee; pass referrerPlayerId to create on the fly",
        404,
      );
    }
    referral = await trackSignup({ brandId, referrerPlayerId, refereePlayerId, refCode });
  }

  // Idempotency: if FTD already recorded, return current state unchanged.
  if (referral.ftdAt) return referral;

  if (referral.status !== "pending_ftd") {
    // Should not happen — `pending_ftd` is the only state without ftdAt.
    return referral;
  }

  referral.ftdAt        = depositedAt ? new Date(depositedAt) : new Date();
  referral.ftdCents     = Number(depositCents);
  referral.ftdCurrency  = currency || null;
  referral.status       = "pending_qualification";
  await referral.save();

  // Best-effort immediate evaluation. If it fails (ClickHouse hiccup), the
  // nightly job will pick up the row anyway. We swallow errors here so a
  // transient backend issue doesn't break the integration call.
  try {
    await evaluateQualification(referral._id);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[referralEngine] post-ftd evaluate failed", { referralId: String(referral._id), error: e.message });
  }

  return await PlayerReferral.findById(referral._id);
}

/**
 * Record an FTD reversal (chargeback / fraud / refund). Transitions the
 * referral per docs/refer-a-friend/SPEC.md §4 reversal table:
 *
 *   pending_qualification → rejected (no webhook)
 *   qualified (pending delivery) → rejected, cancel pending delivery
 *   qualified (delivered + acked) → reversed, fire reward.reversed
 *   rewarded → reversed, fire reward.reversed
 *   reversed | rejected → no-op (idempotent)
 *
 * @returns {{ referral: PlayerReferral, delivery: RewardDelivery|null }}
 */
async function trackFtdReversal({ brandId, refereePlayerId, reversedCents, reason, reversedAt }) {
  if (!brandId || !refereePlayerId) {
    throw new ReferralEngineError("missing_field", "brandId, refereePlayerId required", 400);
  }

  const { operatorId } = await loadEnabledConfig(brandId, { allowDisabled: true });

  const referral = await PlayerReferral.findOne({ operatorId, refereePlayerId });
  if (!referral) {
    throw new ReferralEngineError("referral_not_found", "no referral for this referee", 404);
  }

  // Terminal: no-op.
  if (referral.status === "reversed" || referral.status === "rejected") {
    return { referral, delivery: null };
  }

  const reversedAtTs = reversedAt ? new Date(reversedAt) : new Date();
  referral.reversedAt           = reversedAtTs;
  referral.reversedAmountCents  = reversedCents != null ? Number(reversedCents) : null;
  referral.reversalReason       = reason || null;

  // pending_qualification → rejected, no webhook.
  if (referral.status === "pending_qualification") {
    referral.status          = "rejected";
    referral.rejectionReason = "ftd_reversed";
    await referral.save();
    return { referral, delivery: null };
  }

  // qualified — there is a pending RewardDelivery for the issued reward.
  // If it hasn't gone out yet, cancel it and bail; if it already did and
  // the operator acked, treat as 'rewarded' and fire reversed.
  if (referral.status === "qualified") {
    const issued = await RewardDelivery.findOne({
      referralId: referral._id,
      eventType: "referral.reward.issued",
    }).sort({ createdAt: -1 });

    if (issued && issued.status === "delivered") {
      // Already acked — treat as if rewarded and fire reversal.
      referral.status = "reversed";
      await referral.save();
      const delivery = await enqueueReversedDelivery(referral, issued);
      return { referral, delivery };
    }

    // Otherwise: cancel the in-flight delivery and reject.
    if (issued && issued.status === "pending") {
      issued.status = "failed";
      issued.lastResponse = {
        ...issued.lastResponse,
        errorMessage: "cancelled_by_reversal",
        attemptedAt: new Date(),
      };
      await issued.save();
    }
    referral.status          = "rejected";
    referral.rejectionReason = "ftd_reversed";
    await referral.save();
    return { referral, delivery: null };
  }

  // rewarded — fire reversal delivery.
  if (referral.status === "rewarded") {
    const issued = await RewardDelivery.findOne({
      referralId: referral._id,
      eventType: "referral.reward.issued",
      status: "delivered",
    }).sort({ createdAt: -1 });

    referral.status = "reversed";
    await referral.save();
    const delivery = await enqueueReversedDelivery(referral, issued);
    return { referral, delivery };
  }

  // pending_ftd or any other unexpected state — refuse to silently swallow.
  throw new ReferralEngineError(
    "invalid_state",
    `cannot reverse a referral in state '${referral.status}'`,
    409,
  );
}

/**
 * Re-evaluate a single referral against its config gates. Called both
 * after track-ftd (best-effort, immediate) and from the nightly job.
 *
 * Transitions:
 *   - All gates clear   → status='qualified', enqueue reward.issued delivery
 *   - Pending           → leave in pending_qualification, return current state
 *   - Permanent failure → status='rejected'
 *
 * Idempotent: calling on a non-pending_qualification referral is a no-op.
 */
async function evaluateQualification(referralId, { now } = {}) {
  const referral = await PlayerReferral.findById(referralId);
  if (!referral) {
    throw new ReferralEngineError("referral_not_found", "referral not found", 404);
  }

  if (referral.status !== "pending_qualification") return referral;

  const config = await ReferAFriendConfig.findOne({ brandId: referral.brandId });
  if (!config || !config.enabled) {
    // Config disabled mid-flight: leave the referral alone — the operator
    // explicitly opted out, but in-flight referrals don't get auto-rejected.
    return referral;
  }

  const wagerSinceFtdCents = await fetchWagerSinceFtd({
    operatorId: referral.operatorId,
    refereePlayerId: referral.refereePlayerId,
    ftdAt: referral.ftdAt,
  });

  const decision = evaluateGates({
    ftdCents: referral.ftdCents,
    ftdAt: referral.ftdAt,
    gates: config.qualification || {},
    wagerSinceFtdCents,
    now: now || new Date(),
  });

  if (decision.decision === "pending") return referral;

  if (decision.decision === "rejected") {
    referral.status = "rejected";
    referral.rejectionReason = decision.reason;
    await referral.save();
    return referral;
  }

  // Gates clear — but we still must check monthly caps before paying out.
  const rewardCents = computeReward(config.reward, referral.ftdCents);
  if (rewardCents <= 0) {
    referral.status = "rejected";
    referral.rejectionReason = "reward_zero";
    await referral.save();
    return referral;
  }

  const capCheck = await checkMonthlyCaps({
    operatorId: referral.operatorId,
    brandId: referral.brandId,
    referrerPlayerId: referral.referrerPlayerId,
    rewardCents,
    caps: config.caps || {},
    now: now || new Date(),
  });
  if (!capCheck.ok) {
    referral.status = "rejected";
    referral.rejectionReason = capCheck.reason;
    await referral.save();
    return referral;
  }

  // All clear — qualify and enqueue the issued delivery.
  referral.status         = "qualified";
  referral.qualifiedAt    = new Date();
  referral.rewardCents    = rewardCents;
  referral.rewardCurrency = config.reward.currency || "EUR";
  referral.configSnapshot = snapshotConfig(config);
  await referral.save();

  await enqueueIssuedDelivery(referral, config);

  return referral;
}

// ── Internals ─────────────────────────────────────────────────────────────────

/**
 * Resolve the brand to its (config, operatorId) pair.
 * Throws if the brand is missing, or if `allowDisabled=false` and the
 * config is missing or `enabled=false`.
 */
async function loadEnabledConfig(brandId, { allowDisabled = false } = {}) {
  const brand = await Brand.findById(brandId);
  if (!brand) {
    throw new ReferralEngineError("brand_not_found", "brand not found", 404);
  }
  const operatorId = brand.operatorId;
  const config = await ReferAFriendConfig.findOne({ brandId });

  if (!allowDisabled) {
    if (!config || !config.enabled) {
      throw new ReferralEngineError("feature_disabled", "Refer-a-Friend not enabled for this brand", 403);
    }
  }

  return { config, operatorId };
}

/**
 * Sum of `rewardCents` for already-qualified-or-rewarded-or-reversed
 * referrals in the current calendar month. Used to enforce caps.
 */
async function checkMonthlyCaps({ operatorId, brandId, referrerPlayerId, rewardCents, caps, now }) {
  const PER_REFERRER = Number(caps.perReferrerMonthlyCents) || 0;
  const PER_BRAND    = Number(caps.perBrandMonthlyCents)    || 0;

  if (PER_REFERRER === 0 && PER_BRAND === 0) return { ok: true };

  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  // We count referrals that have a computed reward (qualified/rewarded/
  // reversed) — even reversed ones counted for the period because the
  // operator briefly held the liability. This is the conservative read.
  const matchBase = {
    operatorId,
    qualifiedAt: { $gte: monthStart },
    status: { $in: ["qualified", "rewarded", "reversed"] },
  };

  if (PER_REFERRER > 0) {
    const sum = await sumRewards({ ...matchBase, referrerPlayerId });
    if (sum + rewardCents > PER_REFERRER) {
      return { ok: false, reason: "per_referrer_cap_exceeded" };
    }
  }

  if (PER_BRAND > 0) {
    const sum = await sumRewards({ ...matchBase, brandId });
    if (sum + rewardCents > PER_BRAND) {
      return { ok: false, reason: "per_brand_cap_exceeded" };
    }
  }

  return { ok: true };
}

async function sumRewards(match) {
  const result = await PlayerReferral.aggregate([
    { $match: match },
    { $group: { _id: null, total: { $sum: "$rewardCents" } } },
  ]);
  return (result[0] && result[0].total) || 0;
}

/**
 * Snapshot the bits of config we want preserved on the referral doc for
 * audit. The operator may edit config later; the snapshot stays frozen.
 */
function snapshotConfig(config) {
  return {
    reward: config.reward ? config.reward.toObject ? config.reward.toObject() : { ...config.reward } : null,
    qualification: config.qualification ? config.qualification.toObject ? config.qualification.toObject() : { ...config.qualification } : null,
    caps: config.caps ? config.caps.toObject ? config.caps.toObject() : { ...config.caps } : null,
    snapshotAt: new Date().toISOString(),
  };
}

/**
 * Build the immutable webhook payload for the issued event and write the
 * delivery row. The worker (referralDeliveryWorker.js) picks it up.
 */
async function enqueueIssuedDelivery(referral, config) {
  const payload = {
    id: `evt_${randomId()}`,
    type: "referral.reward.issued",
    createdAt: new Date().toISOString(),
    data: {
      brandId: String(referral.brandId),
      referralId: String(referral._id),
      referrerPlayerId: referral.referrerPlayerId,
      refereePlayerId: referral.refereePlayerId,
      rewardCents: referral.rewardCents,
      rewardCurrency: referral.rewardCurrency,
      rewardKind: (config.reward && config.reward.rewardKind) || "bonus",
      qualifiedAt: referral.qualifiedAt && referral.qualifiedAt.toISOString(),
      ftdCents: referral.ftdCents,
      ftdCurrency: referral.ftdCurrency,
    },
  };

  return RewardDelivery.create({
    referralId: referral._id,
    brandId: referral.brandId,
    operatorId: referral.operatorId,
    eventType: "referral.reward.issued",
    payload,
    payloadHash: hashJson(payload),
    status: "pending",
    nextAttemptAt: new Date(),
  });
}

/**
 * Build and enqueue the reward.reversed delivery. `originalDelivery` is
 * the prior referral.reward.issued delivery (if known); we link the two
 * via `originalDeliveryId` so the operator can correlate.
 */
async function enqueueReversedDelivery(referral, originalDelivery) {
  const payload = {
    id: `evt_${randomId()}`,
    type: "referral.reward.reversed",
    createdAt: new Date().toISOString(),
    data: {
      brandId: String(referral.brandId),
      referralId: String(referral._id),
      originalDeliveryId: originalDelivery ? String(originalDelivery._id) : null,
      referrerPlayerId: referral.referrerPlayerId,
      refereePlayerId: referral.refereePlayerId,
      rewardCents: referral.rewardCents,
      rewardCurrency: referral.rewardCurrency,
      rewardKind:
        (referral.configSnapshot && referral.configSnapshot.reward && referral.configSnapshot.reward.rewardKind) || "bonus",
      qualifiedAt: referral.qualifiedAt && referral.qualifiedAt.toISOString(),
      reversedAt: referral.reversedAt && referral.reversedAt.toISOString(),
      reversalReason: referral.reversalReason,
      reversedAmountCents: referral.reversedAmountCents,
      ftdCurrency: referral.ftdCurrency,
    },
  };

  return RewardDelivery.create({
    referralId: referral._id,
    brandId: referral.brandId,
    operatorId: referral.operatorId,
    eventType: "referral.reward.reversed",
    payload,
    payloadHash: hashJson(payload),
    status: "pending",
    nextAttemptAt: new Date(),
  });
}

/**
 * Wager-since-FTD lookup via ClickHouse. Mirrors the activity_hourly_delta
 * query the affiliate engine uses, narrowed to a single (operator, player)
 * pair. Kept inside the engine so the integration / qualification flow has
 * a single import surface; testable in isolation by stubbing the
 * `clickhouse` module via Jest.
 *
 * Defensive: if ClickHouse is unavailable or the player has no recorded
 * activity, returns 0. The qualification function will then leave the
 * referral in `pending` due to the wager gate (assuming one is set).
 */
async function fetchWagerSinceFtd({ operatorId, refereePlayerId, ftdAt }) {
  if (!ftdAt) return 0;
  let clickhouse;
  try {
    clickhouse = require("../config/clickhouse");
  } catch (_e) {
    return 0; // dev / test environments without ClickHouse wired up
  }

  const sql = `
    SELECT toInt64(SUM(toInt64(bets_sum_cents) - toInt64(casino_bets_rollbacks_sum_cents))) AS wagerCents
    FROM affiliate.activity_hourly_delta
    WHERE tenant_id = {tenantId:String}
      AND player_id = {playerId:String}
      AND hour_bucket >= {fromTs:DateTime}
  `;

  try {
    const result = await clickhouse.query({
      query: sql,
      query_params: {
        tenantId: String(operatorId),
        playerId: refereePlayerId,
        fromTs: ftdAt,
      },
      format: "JSONEachRow",
    });
    const rows = await result.json();
    return Math.max(0, Number(rows[0] && rows[0].wagerCents) || 0);
  } catch (_e) {
    return 0;
  }
}

// ── Tiny helpers ──────────────────────────────────────────────────────────────

function randomId() {
  return crypto.randomBytes(13).toString("hex");
}

function hashJson(obj) {
  return crypto.createHash("sha256").update(JSON.stringify(obj)).digest("hex");
}

module.exports = {
  trackSignup,
  trackFtd,
  trackFtdReversal,
  evaluateQualification,
  ReferralEngineError,
  // exposed for testing
  _internals: { fetchWagerSinceFtd, snapshotConfig, checkMonthlyCaps },
};
