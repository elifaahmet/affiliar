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

  // Anti-abuse: when the brand opts into blockSameSignals, refuse the
  // referral if the referee shares any of ipHash/deviceHash/walletHash
  // with the referrer (or, more broadly, with any other operator-scoped
  // AffiliatePlayer). Hashes are captured upstream by ingestRawEvent on
  // player.registered + wallet.deposit.confirmed; missing hashes simply
  // can't trip the check.
  if (config.qualification && config.qualification.blockSameSignals) {
    const collision = await detectSignalCollision({
      operatorId,
      referrerPlayerId,
      refereePlayerId,
    });
    if (collision) {
      throw new ReferralEngineError(
        "abuse_same_signals",
        `referral blocked: ${collision} matches another account on this operator`,
        409,
      );
    }
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

  // qualified — there are pending RewardDelivery rows. Cancel any pending,
  // fire reversals only for those that already delivered + acked.
  if (referral.status === "qualified") {
    const cancelled = await cancelPendingDeliveries(referral._id);
    const issued        = await findDeliveredDelivery(referral._id, "referral.reward.issued");
    const refereeIssued = await findDeliveredDelivery(referral._id, "referral.reward.referee.issued");

    if (issued || refereeIssued) {
      // At least one side acked — treat as rewarded and fire reversals.
      referral.status = "reversed";
      await referral.save();
      const delivery        = issued        ? await enqueueReversedDelivery(referral, issued)               : null;
      const refereeDelivery = refereeIssued ? await enqueueRefereeReversedDelivery(referral, refereeIssued) : null;
      return { referral, delivery, refereeDelivery };
    }

    // Nothing delivered yet — just reject.
    referral.status          = "rejected";
    referral.rejectionReason = "ftd_reversed";
    await referral.save();
    return { referral, delivery: null, refereeDelivery: null, cancelled };
  }

  // rewarded — fire reversal deliveries for whichever sides were paid.
  if (referral.status === "rewarded") {
    const issued        = await findDeliveredDelivery(referral._id, "referral.reward.issued");
    const refereeIssued = await findDeliveredDelivery(referral._id, "referral.reward.referee.issued");

    referral.status = "reversed";
    await referral.save();

    const delivery        = issued        ? await enqueueReversedDelivery(referral, issued)               : null;
    const refereeDelivery = refereeIssued ? await enqueueRefereeReversedDelivery(referral, refereeIssued) : null;
    return { referral, delivery, refereeDelivery };
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

  const [wagerSinceFtdCents, refereeSnapshot] = await Promise.all([
    fetchWagerSinceFtd({
      operatorId: referral.operatorId,
      refereePlayerId: referral.refereePlayerId,
      ftdAt: referral.ftdAt,
    }),
    // Crew "active player" gates need the referee's lifetime activity +
    // account age + fraud signal. Fetched only when the operator has
    // configured at least one of the new gates so we don't pay the CH
    // round-trip on every legacy referral evaluation.
    needsActiveSnapshot(config.qualification || {})
      ? fetchRefereeActivitySnapshot({
          operatorId: referral.operatorId,
          refereePlayerId: referral.refereePlayerId,
        })
      : Promise.resolve(null),
  ]);

  // Crew is an aggregate game: the referrer is paid on the TOTAL netted NGR
  // of their whole crew, so an individual referee need not be NGR-positive to
  // belong to the crew (a losing month for one member nets against winning
  // months of others). Drop the per-referee requirePositiveNgr gate for
  // crew_tiered; all other gates (deposit, wager, active deposits, age,
  // signals) still apply. Other reward shapes keep the gate as configured.
  const gates =
    config.reward && config.reward.type === "crew_tiered"
      ? { ...(config.qualification || {}), requirePositiveNgr: false }
      : config.qualification || {};

  const decision = evaluateGates({
    ftdCents: referral.ftdCents,
    ftdAt: referral.ftdAt,
    gates,
    wagerSinceFtdCents,
    refereeSnapshot,
    now: now || new Date(),
  });

  if (decision.decision === "pending") return referral;

  if (decision.decision === "rejected") {
    referral.status = "rejected";
    referral.rejectionReason = decision.reason;
    await referral.save();
    return referral;
  }

  // Crew (tiered) has no one-shot payout — its value is ongoing crew
  // membership plus monthly recurring payouts (referralRecurringJob). The
  // one-shot reward therefore computes to 0, which must NOT reject the
  // referral as reward_zero. Instead, once gates clear the referee becomes
  // an active crew member straight away (status 'rewarded' — that's what the
  // crew count and the recurring job key off), and the recurring job pays it
  // month by month. The referee's two-sided welcome bonus, if enabled, still
  // applies.
  if (config.reward && config.reward.type === "crew_tiered") {
    const crewRefereeRewardCents =
      config.refereeReward && config.refereeReward.enabled
        ? computeReward(config.refereeReward, referral.ftdCents)
        : 0;

    const crewCapCheck = await checkMonthlyCaps({
      operatorId: referral.operatorId,
      brandId: referral.brandId,
      referrerPlayerId: referral.referrerPlayerId,
      rewardCents: crewRefereeRewardCents,
      caps: config.caps || {},
      now: now || new Date(),
    });
    if (!crewCapCheck.ok) {
      referral.status = "rejected";
      referral.rejectionReason = crewCapCheck.reason;
      await referral.save();
      return referral;
    }

    const crewRewardCurrency = config.reward.currency || "EUR";
    const crewAt = new Date();
    referral.status         = "rewarded";
    referral.qualifiedAt    = crewAt;
    referral.rewardedAt     = crewAt;
    referral.rewardCents    = 0; // no one-shot for crew — recurring job pays monthly
    referral.rewardCurrency = crewRewardCurrency;
    if (crewRefereeRewardCents > 0) {
      referral.refereeRewardCents    = crewRefereeRewardCents;
      referral.refereeRewardCurrency = crewRewardCurrency;
    }
    referral.configSnapshot = snapshotConfig(config);
    await referral.save();

    if (crewRefereeRewardCents > 0) {
      await enqueueRefereeIssuedDelivery(referral, config);
    }
    return referral;
  }

  // Gates clear — but we still must check monthly caps before paying out.
  const referrerRewardCents = computeReward(config.reward, referral.ftdCents);
  if (referrerRewardCents <= 0) {
    referral.status = "rejected";
    referral.rejectionReason = "reward_zero";
    await referral.save();
    return referral;
  }

  // Two-sided rewards: compute the referee bonus too, if enabled. The
  // referee reward is opt-in (defaults disabled), so existing operators
  // see no behavioral change.
  const refereeRewardCents =
    config.refereeReward && config.refereeReward.enabled
      ? computeReward(config.refereeReward, referral.ftdCents)
      : 0;

  // Caps are evaluated against the combined operator spend per referral.
  // Partial payouts are not allowed — if the total would exceed any cap,
  // the entire referral is rejected. Cleaner audit story than picking a
  // winner.
  const totalRewardCents = referrerRewardCents + refereeRewardCents;
  const capCheck = await checkMonthlyCaps({
    operatorId: referral.operatorId,
    brandId: referral.brandId,
    referrerPlayerId: referral.referrerPlayerId,
    rewardCents: totalRewardCents,
    caps: config.caps || {},
    now: now || new Date(),
  });
  if (!capCheck.ok) {
    referral.status = "rejected";
    referral.rejectionReason = capCheck.reason;
    await referral.save();
    return referral;
  }

  // All clear — qualify and enqueue both deliveries (referrer always,
  // referee only if its reward computed to a positive amount).
  const rewardCurrency = config.reward.currency || "EUR";
  referral.status         = "qualified";
  referral.qualifiedAt    = new Date();
  referral.rewardCents    = referrerRewardCents;
  referral.rewardCurrency = rewardCurrency;
  if (refereeRewardCents > 0) {
    referral.refereeRewardCents    = refereeRewardCents;
    referral.refereeRewardCurrency = rewardCurrency;
  }
  referral.configSnapshot = snapshotConfig(config);
  await referral.save();

  await enqueueIssuedDelivery(referral, config);
  if (refereeRewardCents > 0) {
    await enqueueRefereeIssuedDelivery(referral, config);
  }

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
  const lift = (sub) => (sub ? (sub.toObject ? sub.toObject() : { ...sub }) : null);
  return {
    reward:         lift(config.reward),
    refereeReward:  lift(config.refereeReward),
    qualification:  lift(config.qualification),
    caps:           lift(config.caps),
    snapshotAt:     new Date().toISOString(),
  };
}

/**
 * Find the latest already-delivered (and acked) row of a given event
 * type for a referral. Returns null if none. Used by reversal logic to
 * decide whether to fire a reversed event for that side.
 */
async function findDeliveredDelivery(referralId, eventType) {
  return RewardDelivery.findOne({
    referralId,
    eventType,
    status: "delivered",
  }).sort({ createdAt: -1 });
}

/**
 * Cancel any in-flight (pending) deliveries for this referral when the
 * operator reverses the FTD before either side acked. Marks them
 * 'failed' with a `cancelled_by_reversal` error so the dashboard reads
 * are clean. Returns the number of rows cancelled.
 */
async function cancelPendingDeliveries(referralId) {
  const rows = await RewardDelivery.find({ referralId, status: "pending" });
  for (const row of rows) {
    row.status = "failed";
    row.lastResponse = {
      ...(row.lastResponse || {}),
      errorMessage: "cancelled_by_reversal",
      attemptedAt: new Date(),
    };
    await row.save();
  }
  return rows.length;
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
 * Phase 2 two-sided rewards: queue the referee welcome bonus delivery.
 * Same envelope + signing as the referrer event, but the recipient is
 * `data.refereePlayerId`. Operators MUST handle this event type to
 * credit the friend's wallet — the referrer event no longer covers
 * both sides on its own.
 */
async function enqueueRefereeIssuedDelivery(referral, config) {
  const payload = {
    id: `evt_${randomId()}`,
    type: "referral.reward.referee.issued",
    createdAt: new Date().toISOString(),
    data: {
      brandId: String(referral.brandId),
      referralId: String(referral._id),
      referrerPlayerId: referral.referrerPlayerId,
      refereePlayerId: referral.refereePlayerId,
      rewardCents: referral.refereeRewardCents,
      rewardCurrency: referral.refereeRewardCurrency,
      rewardKind: (config.refereeReward && config.refereeReward.rewardKind) || "bonus",
      qualifiedAt: referral.qualifiedAt && referral.qualifiedAt.toISOString(),
      ftdCents: referral.ftdCents,
      ftdCurrency: referral.ftdCurrency,
    },
  };

  return RewardDelivery.create({
    referralId: referral._id,
    brandId: referral.brandId,
    operatorId: referral.operatorId,
    eventType: "referral.reward.referee.issued",
    payload,
    payloadHash: hashJson(payload),
    status: "pending",
    nextAttemptAt: new Date(),
  });
}

/**
 * Reversal counterpart for the referee bonus. Fires only if the referee
 * side actually delivered (operator already credited the friend).
 */
async function enqueueRefereeReversedDelivery(referral, originalDelivery) {
  const payload = {
    id: `evt_${randomId()}`,
    type: "referral.reward.referee.reversed",
    createdAt: new Date().toISOString(),
    data: {
      brandId: String(referral.brandId),
      referralId: String(referral._id),
      originalDeliveryId: originalDelivery ? String(originalDelivery._id) : null,
      referrerPlayerId: referral.referrerPlayerId,
      refereePlayerId: referral.refereePlayerId,
      rewardCents: referral.refereeRewardCents,
      rewardCurrency: referral.refereeRewardCurrency,
      rewardKind:
        (referral.configSnapshot && referral.configSnapshot.refereeReward && referral.configSnapshot.refereeReward.rewardKind) || "bonus",
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
    eventType: "referral.reward.referee.reversed",
    payload,
    payloadHash: hashJson(payload),
    status: "pending",
    nextAttemptAt: new Date(),
  });
}

/**
 * Phase 2 Step 4 — recurring reward delivery. The recurring job builds
 * the payment record on PlayerReferral.recurringPayments, then calls
 * this to write the actual webhook row. Returns the created delivery
 * so the caller can link `recurringPayments[i].deliveryId`.
 */
async function enqueueRecurringDelivery(referral, payment, recurringConfig) {
  const payload = {
    id: `evt_${randomId()}`,
    type: "referral.reward.recurring.issued",
    createdAt: new Date().toISOString(),
    data: {
      brandId: String(referral.brandId),
      referralId: String(referral._id),
      referrerPlayerId: referral.referrerPlayerId,
      refereePlayerId: referral.refereePlayerId,
      period: { year: payment.year, month: payment.month },
      ngrCents: payment.ngrCents,
      ngrMetric: (recurringConfig && recurringConfig.ngrMetric) || "ngr",
      rewardCents: payment.rewardCents,
      rewardCurrency: payment.rewardCurrency,
      rewardKind: (recurringConfig && recurringConfig.rewardKind) || "cash",
      qualifiedAt: referral.qualifiedAt && referral.qualifiedAt.toISOString(),
      // Crew (tiered) payouts ride along the referrer's current level so
      // the operator can show "reached level N" next to the amount. Absent
      // for the legacy flat-percent recurring reward.
      ...(recurringConfig && recurringConfig.crew
        ? { crew: recurringConfig.crew }
        : {}),
    },
  };

  return RewardDelivery.create({
    referralId: referral._id,
    brandId: referral.brandId,
    operatorId: referral.operatorId,
    eventType: "referral.reward.recurring.issued",
    payload,
    payloadHash: hashJson(payload),
    status: "pending",
    nextAttemptAt: new Date(),
  });
}

/**
 * Pull a single player's monthly NGR (or GGR) from ClickHouse for the
 * recurring job. Returns 0 if ClickHouse isn't wired up or the player
 * had no activity that month — caller should treat 0 as "skip this
 * month, nothing to pay" rather than an error.
 *
 * `ngrMetric`:
 *   ggr — bets - wins (simplest, least disputable)
 *   ngr — bets - wins - bonuses (simplified; no fees subtracted, unlike
 *         the commission engine's NGR which is heavier)
 */
async function fetchPlayerMonthlyBase({ operatorId, refereePlayerId, year, month, ngrMetric = "ngr" }) {
  let clickhouse;
  try {
    clickhouse = require("../config/clickhouse");
  } catch (_e) {
    return 0;
  }

  const pad = (n) => String(n).padStart(2, "0");
  const lastDay = new Date(year, month, 0).getDate(); // month is 1-based
  const fromTs = `${year}-${pad(month)}-01 00:00:00`;
  const toTs   = `${year}-${pad(month)}-${pad(lastDay)} 23:59:59`;

  // Casino bonuses live in `bonus_issues_sum_cents` on the delta.
  // For sportsbook the same column is reused (operators that need a
  // different sb base should use 'ggr').
  const sql = ngrMetric === "ggr"
    ? `SELECT toInt64(SUM(toInt64(bets_sum_cents) - toInt64(wins_sum_cents))) AS baseCents
       FROM affiliate.activity_hourly_delta
       WHERE tenant_id = {tenantId:String}
         AND player_id = {playerId:String}
         AND hour_bucket >= {fromTs:DateTime}
         AND hour_bucket <= {toTs:DateTime}`
    : `SELECT toInt64(SUM(
           toInt64(bets_sum_cents)
         - toInt64(wins_sum_cents)
         - toInt64(bonus_issues_sum_cents)
       )) AS baseCents
       FROM affiliate.activity_hourly_delta
       WHERE tenant_id = {tenantId:String}
         AND player_id = {playerId:String}
         AND hour_bucket >= {fromTs:DateTime}
         AND hour_bucket <= {toTs:DateTime}`;

  try {
    const result = await clickhouse.query({
      query: sql,
      query_params: { tenantId: String(operatorId), playerId: refereePlayerId, fromTs, toTs },
      format: "JSONEachRow",
    });
    const rows = await result.json();
    return Math.max(0, Number(rows[0] && rows[0].baseCents) || 0);
  } catch (_e) {
    return 0;
  }
}

/**
 * Sum a crew's monthly NGR (or GGR) across ALL the referrer's active referees
 * in one query. Unlike fetchPlayerMonthlyBase this does NOT floor per player —
 * the SUM nets winners against losers, so a member who beat the house that
 * month reduces the pool. The SIGNED total is returned (can be negative);
 * callers floor it, so a net-negative crew month pays nothing. Returns 0 if
 * ClickHouse isn't wired up or there was no activity.
 */
async function fetchCrewMonthlyBase({ operatorId, refereePlayerIds, year, month, ngrMetric = "ngr" }) {
  if (!Array.isArray(refereePlayerIds) || refereePlayerIds.length === 0) return 0;
  let clickhouse;
  try {
    clickhouse = require("../config/clickhouse");
  } catch (_e) {
    return 0;
  }

  const pad = (n) => String(n).padStart(2, "0");
  const lastDay = new Date(year, month, 0).getDate(); // month is 1-based
  const fromTs = `${year}-${pad(month)}-01 00:00:00`;
  const toTs   = `${year}-${pad(month)}-${pad(lastDay)} 23:59:59`;

  const baseExpr = ngrMetric === "ggr"
    ? "toInt64(bets_sum_cents) - toInt64(wins_sum_cents)"
    : "toInt64(bets_sum_cents) - toInt64(wins_sum_cents) - toInt64(bonus_issues_sum_cents)";

  const sql = `SELECT toInt64(SUM(${baseExpr})) AS baseCents
       FROM affiliate.activity_hourly_delta
       WHERE tenant_id = {tenantId:String}
         AND player_id IN {playerIds:Array(String)}
         AND hour_bucket >= {fromTs:DateTime}
         AND hour_bucket <= {toTs:DateTime}`;

  try {
    const result = await clickhouse.query({
      query: sql,
      query_params: {
        tenantId: String(operatorId),
        playerIds: refereePlayerIds.map(String),
        fromTs,
        toTs,
      },
      format: "JSONEachRow",
    });
    const rows = await result.json();
    return Number(rows[0] && rows[0].baseCents) || 0; // signed — caller floors
  } catch (_e) {
    return 0;
  }
}

/**
 * Per-referee breakdown of a crew's monthly NGR (or GGR). Same query as
 * fetchCrewMonthlyBase but GROUP BY player_id, so the caller can attribute
 * each referee's signed NGR (winners come back negative) and show the
 * per-referee × tier% breakdown that sums to the crew payout. Returns a
 * Map<playerId, ngrCents>; players with no activity that month are absent
 * (treat as 0).
 */
async function fetchCrewMonthlyBasePerReferee({ operatorId, refereePlayerIds, year, month, ngrMetric = "ngr" }) {
  const out = new Map();
  if (!Array.isArray(refereePlayerIds) || refereePlayerIds.length === 0) return out;
  let clickhouse;
  try {
    clickhouse = require("../config/clickhouse");
  } catch (_e) {
    return out;
  }

  const pad = (n) => String(n).padStart(2, "0");
  const lastDay = new Date(year, month, 0).getDate();
  const fromTs = `${year}-${pad(month)}-01 00:00:00`;
  const toTs   = `${year}-${pad(month)}-${pad(lastDay)} 23:59:59`;

  const baseExpr = ngrMetric === "ggr"
    ? "toInt64(bets_sum_cents) - toInt64(wins_sum_cents)"
    : "toInt64(bets_sum_cents) - toInt64(wins_sum_cents) - toInt64(bonus_issues_sum_cents)";

  const sql = `SELECT player_id AS pid, toInt64(SUM(${baseExpr})) AS baseCents
       FROM affiliate.activity_hourly_delta
       WHERE tenant_id = {tenantId:String}
         AND player_id IN {playerIds:Array(String)}
         AND hour_bucket >= {fromTs:DateTime}
         AND hour_bucket <= {toTs:DateTime}
       GROUP BY player_id`;

  try {
    const result = await clickhouse.query({
      query: sql,
      query_params: {
        tenantId: String(operatorId),
        playerIds: refereePlayerIds.map(String),
        fromTs,
        toTs,
      },
      format: "JSONEachRow",
    });
    const rows = await result.json();
    for (const r of rows) out.set(String(r.pid), Number(r.baseCents) || 0);
  } catch (_e) {
    /* leave empty */
  }
  return out;
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
/**
 * Refer-a-friend anti-abuse check. Returns null when the referee's
 * fingerprints don't collide with anyone else on the operator, or a
 * short reason string ("ipHash" / "deviceHash" / "walletHash") naming
 * the first matching field. The check is scoped to the operator's own
 * AffiliatePlayer rows; no cross-operator data leak.
 */
async function detectSignalCollision({ operatorId, referrerPlayerId, refereePlayerId }) {
  const referee = await AffiliatePlayer.findOne({
    operatorId,
    playerId: refereePlayerId,
  })
    .select({ ipHash: 1, deviceHash: 1, walletHash: 1 })
    .lean();
  if (!referee) return null; // no fingerprints captured yet — can't trip

  const fields = ["ipHash", "deviceHash", "walletHash"];
  for (const f of fields) {
    const val = referee[f];
    if (!val) continue;
    const conflict = await AffiliatePlayer.findOne({
      operatorId,
      playerId: { $ne: refereePlayerId },
      [f]: val,
    })
      .select({ _id: 1, playerId: 1 })
      .lean();
    if (conflict) return f;
  }

  // Always-on belt-and-suspenders: even when the referee has no captured
  // fingerprints, the referrer might share one with someone else who has
  // the same hash as the referee at deposit time. The narrower check
  // above already covers the common case; if we wanted to widen we'd
  // also scan the referrer's hashes here. Skip for V1 — the referee-side
  // check is the meaningful one (you're attributing a signup to a new
  // account that turns out to share signals with an old account).
  void referrerPlayerId;
  return null;
}

/**
 * Quick check for whether the Crew "active player" snapshot is needed for
 * a given qualification config. Avoids a ClickHouse round-trip on legacy
 * brands that haven't opted into any of the new gates.
 */
function needsActiveSnapshot(qualification) {
  if (!qualification) return false;
  return (
    (Number(qualification.minActiveDeposits) || 0) > 0 ||
    (Number(qualification.minAccountAgeDays) || 0) > 0 ||
    !!qualification.requirePositiveNgr
  );
}

/**
 * Lifetime snapshot of a referee's activity for the Crew "active player"
 * gates. Mirrors fetchWagerSinceFtd's pattern (defensive against a missing
 * ClickHouse module so unit envs still load). Combines:
 *   - ClickHouse: depositsCount + lifetime NGR (cents) for the player
 *   - Mongo:      registeredAt + fraudFlagged from AffiliatePlayer
 *
 * Returns sane defaults on any failure so the qualification engine can
 * still make a decision (it'll fail-open on missing data).
 */
async function fetchRefereeActivitySnapshot({ operatorId, refereePlayerId }) {
  const out = {
    depositsCount:    0,
    lifetimeNgrCents: 0,
    accountAgeDays:   null,    // null = unknown (no AffiliatePlayer row)
    fraudFlagged:     false,
  };

  // AffiliatePlayer side: registeredAt + fraud signal.
  try {
    const ap = await AffiliatePlayer.findOne({
      operatorId,
      playerId: refereePlayerId,
    })
      .select({ registeredAt: 1, fraudFlagged: 1 })
      .lean();
    if (ap) {
      out.fraudFlagged = !!ap.fraudFlagged;
      if (ap.registeredAt) {
        const ageMs = Date.now() - new Date(ap.registeredAt).getTime();
        out.accountAgeDays = Math.max(0, ageMs / (24 * 60 * 60 * 1000));
      }
    }
  } catch (_e) {
    /* leave defaults */
  }

  // ClickHouse side: lifetime deposit count + NGR.
  let clickhouse;
  try { clickhouse = require("../config/clickhouse"); } catch (_e) {
    return out; // dev/test envs without CH wired up
  }
  const sql = `
    SELECT
      toInt64(SUM(toInt64(deposits_count))) AS depositsCount,
      toInt64(SUM(
          toInt64(bets_sum_cents) - toInt64(casino_bets_rollbacks_sum_cents)
        - toInt64(wins_sum_cents) + toInt64(casino_wins_rollbacks_sum_cents)
        - toInt64(bonus_issues_sum_cents)
        - toInt64(additional_deductions_sum_cents)
        - toInt64(payment_system_fees_sum_cents)
        - toInt64(jackpot_fees_sum_cents)
        - toInt64(game_provider_fees_sum_cents)
        - toInt64(casino_taxes_sum_cents)
      )) AS lifetimeNgrCents
    FROM affiliate.activity_hourly_delta
    WHERE tenant_id = {tenantId:String}
      AND player_id = {playerId:String}
  `;
  try {
    const result = await clickhouse.query({
      query: sql,
      query_params: {
        tenantId: String(operatorId),
        playerId: refereePlayerId,
      },
      format: "JSONEachRow",
    });
    const rows = await result.json();
    const r = rows[0] || {};
    out.depositsCount    = Math.max(0, Number(r.depositsCount)    || 0);
    out.lifetimeNgrCents = Number(r.lifetimeNgrCents) || 0; // can be < 0
  } catch (_e) {
    /* leave defaults */
  }

  return out;
}

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

/**
 * Run the referral-state cascade for a delivery that just transitioned
 * to 'delivered'. Used by the pull-model claim endpoint (and previously
 * by the now-retired webhook worker). Idempotent — re-running on an
 * already-cascaded referral is a no-op.
 *
 * Cascade rules (mirror what the old worker did):
 *   referral.reward.issued            → referral.status='rewarded', rewardedAt=now
 *   referral.reward.referee.issued    → referral.refereeRewardedAt=now
 *   referral.reward.recurring.issued  → matching recurringPayments[].paidAt=now
 *   reversed events                   → no cascade (engine already moved status)
 */
async function applyDeliveryAck(delivery) {
  if (!delivery || !delivery.referralId) return;

  const referral = await PlayerReferral.findById(delivery.referralId);
  if (!referral) return;

  if (delivery.eventType === "referral.reward.issued") {
    if (referral.status === "qualified") {
      referral.status = "rewarded";
      referral.rewardedAt = new Date();
      await referral.save();
    }
    return;
  }

  if (delivery.eventType === "referral.reward.referee.issued") {
    if (!referral.refereeRewardedAt) {
      referral.refereeRewardedAt = new Date();
      await referral.save();
    }
    return;
  }

  if (delivery.eventType === "referral.reward.recurring.issued") {
    const payments = referral.recurringPayments || [];
    const match = payments.find(
      (p) => p.deliveryId && String(p.deliveryId) === String(delivery._id),
    );
    if (match && !match.paidAt) {
      match.paidAt = new Date();
      await referral.save();
    }
  }
  // Reversed events: engine already moved referral.status to 'reversed'.
}

module.exports = {
  trackSignup,
  trackFtd,
  trackFtdReversal,
  evaluateQualification,
  enqueueRecurringDelivery,
  fetchPlayerMonthlyBase,
  fetchCrewMonthlyBase,
  fetchCrewMonthlyBasePerReferee,
  applyDeliveryAck,
  ReferralEngineError,
  // exposed for testing
  _internals: { fetchWagerSinceFtd, snapshotConfig, checkMonthlyCaps },
};
