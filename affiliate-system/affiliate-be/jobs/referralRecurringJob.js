"use strict";

/**
 * Phase 2 Step 4 — recurring referral rewards.
 *
 * Once a referral reaches `status: 'rewarded'`, the operator may have
 * configured a percent share of the friend's monthly base (NGR or GGR)
 * to keep flowing to the referrer. This job pays that share once per
 * calendar month per referral.
 *
 * Idempotent on `(referralId, year, month)` — the job appends a row
 * to `PlayerReferral.recurringPayments` only if no entry for that
 * (year, month) exists yet. Re-runs on the same day are no-ops.
 *
 * Schedule:
 *   - Runs daily on a 24h interval (REFERRAL_RECURRING_JOB_REFRESH_MS).
 *   - Skips if today's UTC day-of-month < REFERRAL_RECURRING_RUN_DAY
 *     (default 5). Gives the fees-daily cron + ClickHouse SummingMerge
 *     replication time to settle yesterday's data before we read it
 *     for the previous month's totals.
 *   - When it does run, processes the *previous* calendar month.
 *
 * Lifecycle:
 *   - Only `status: 'rewarded'` referrals accrue. If FTD is later
 *     reversed (`status: 'reversed'`), future months stop. Past
 *     payments stay on the ledger (operator policy: earned on real
 *     activity, not clawed back).
 *   - Duration: if `recurringReward.durationMonths` is set,
 *     `recurringPayments.length >= durationMonths` retires the
 *     referral from future runs.
 */

const PlayerReferral     = require("../models/PlayerReferral");
const ReferAFriendConfig = require("../models/ReferAFriendConfig");
const engine             = require("../engine/referralEngine");
const raReward           = require("../engine/raReward");
const { logger }         = require("../middlewares/logger");

const REFRESH_MS = parseInt(
  process.env.REFERRAL_RECURRING_JOB_REFRESH_MS || String(24 * 60 * 60 * 1000),
  10,
);
const INITIAL_DELAY_MS = parseInt(
  process.env.REFERRAL_RECURRING_JOB_INITIAL_DELAY_MS || String(7 * 60 * 1000),
  10,
);
const RUN_DAY = parseInt(process.env.REFERRAL_RECURRING_RUN_DAY || "5", 10);

let scheduledTimer = null;

/**
 * One pass for an explicit period. Public so tests + ad-hoc operator
 * triggers can run for any month.
 */
async function runForMonth({ year, month }) {
  const stats = {
    period: { year, month },
    eligible: 0,
    paid: 0,
    skippedDuration: 0,
    skippedAlreadyPaid: 0,
    skippedZeroBase: 0,
    skippedZeroReward: 0,
    errors: 0,
  };

  // Stream referrals in 'rewarded' state — these are the only ones that
  // accrue. Even if recurringReward was disabled at qualification time,
  // we still iterate; the per-row check below filters them out cheaply.
  // Frozen referrals are skipped — operator admin re-enables them later
  // and the next monthly run resumes payouts.
  const cursor = PlayerReferral.find({
    status: "rewarded",
    $or: [{ frozen: false }, { frozen: { $exists: false } }],
  }).cursor();

  for await (const referral of cursor) {
    try {
      stats.eligible++;
      const result = await processReferral(referral, { year, month });
      if (result.paid)              stats.paid++;
      if (result.skipped === "duration_exhausted")  stats.skippedDuration++;
      if (result.skipped === "already_paid")        stats.skippedAlreadyPaid++;
      if (result.skipped === "zero_base")           stats.skippedZeroBase++;
      if (result.skipped === "zero_reward")         stats.skippedZeroReward++;
    } catch (err) {
      stats.errors++;
      logger.error("referral.recurring.row_failed", {
        referralId: String(referral._id),
        error: err?.message || String(err),
      });
    }
  }

  logger.info("referral.recurring.job.ok", stats);
  return stats;
}

/**
 * Process a single referral. Returns:
 *   { paid: true } when a delivery was enqueued
 *   { skipped: '<reason>' } when nothing to do
 */
async function processReferral(referral, { year, month }) {
  // Crew (tiered) reward branch — when the referee's qualifying config
  // chose reward.type === "crew_tiered", the monthly payout uses the
  // referrer's current active-crew count, not a static percent. Detect
  // first; if not Crew, fall through to the legacy recurringReward path.
  const snapReward = referral.configSnapshot && referral.configSnapshot.reward;
  let rewardCfg = snapReward;
  if (!rewardCfg || !rewardCfg.type) {
    const live = await ReferAFriendConfig.findOne({ brandId: referral.brandId });
    rewardCfg = live && live.reward;
  }
  if (rewardCfg && rewardCfg.type === "crew_tiered") {
    return processCrewReferral(referral, { year, month, rewardCfg });
  }

  // Resolve the recurring config. Prefer the snapshot taken at
  // qualification time (so plan changes don't retroactively shift
  // earnings). Fall back to live config for referrals that qualified
  // before recurring was a thing.
  const snapRec = referral.configSnapshot
    && referral.configSnapshot.recurringReward;
  let recurring = snapRec;
  if (!recurring || !recurring.enabled) {
    const live = await ReferAFriendConfig.findOne({ brandId: referral.brandId });
    recurring = live && live.recurringReward;
  }
  if (!recurring || !recurring.enabled || !(recurring.percent > 0)) {
    return { skipped: "not_configured" };
  }

  // Duration check
  const paid = (referral.recurringPayments || []).length;
  if (recurring.durationMonths && paid >= recurring.durationMonths) {
    return { skipped: "duration_exhausted" };
  }

  // Idempotency on (year, month)
  const already = (referral.recurringPayments || []).some(
    (p) => p.year === year && p.month === month,
  );
  if (already) return { skipped: "already_paid" };

  // Friend's base for the month
  const ngrCents = await engine.fetchPlayerMonthlyBase({
    operatorId: referral.operatorId,
    refereePlayerId: referral.refereePlayerId,
    year,
    month,
    ngrMetric: recurring.ngrMetric || "ngr",
  });
  if (ngrCents <= 0) return { skipped: "zero_base" };

  // Reward computation + cap
  let rewardCents = Math.floor((ngrCents * (Number(recurring.percent) || 0)) / 100);
  if (recurring.monthlyCapCents && rewardCents > recurring.monthlyCapCents) {
    rewardCents = recurring.monthlyCapCents;
  }
  if (rewardCents <= 0) return { skipped: "zero_reward" };

  const rewardCurrency = referral.rewardCurrency || "EUR";

  // Append the payment row first (so re-run before delivery enqueue
  // doesn't double-pay), then enqueue the delivery, then back-fill the
  // deliveryId. Worst case if the enqueue throws: we have a phantom
  // payment row with no delivery — still safer than the inverse, since
  // the operator dashboard will surface the orphan and we can replay.
  referral.recurringPayments = referral.recurringPayments || [];
  referral.recurringPayments.push({
    year,
    month,
    ngrCents,
    rewardCents,
    rewardCurrency,
    enqueuedAt: new Date(),
  });
  await referral.save();

  const delivery = await engine.enqueueRecurringDelivery(
    referral,
    { year, month, ngrCents, rewardCents, rewardCurrency },
    recurring,
  );

  // Back-fill deliveryId on the row we just appended.
  const last = referral.recurringPayments[referral.recurringPayments.length - 1];
  last.deliveryId = delivery._id;
  await referral.save();

  return { paid: true };
}

/**
 * Crew (tiered) variant of processReferral. The referrer's current active-
 * crew count drives the percent (via crewLevels), the referee's monthly
 * NGR is the base, and the strategy module decides the exact cents. Same
 * idempotency + ledger semantics as the legacy path — payment row is
 * written first, delivery is enqueued second, then the deliveryId is
 * back-filled.
 *
 * Active count = referrer's `status: 'rewarded'` referrals on the same
 * operator. Counted at run time (cheap with the index on
 * { operatorId, referrerPlayerId, status }) so a referrer who climbs a
 * level mid-month gets the higher rate next run, not retroactively.
 */
async function processCrewReferral(referral, { year, month, rewardCfg }) {
  // Duration (Crew has no built-in duration cap yet — runs as long as
  // referral is rewarded) and idempotency mirror the legacy path.
  const already = (referral.recurringPayments || []).some(
    (p) => p.year === year && p.month === month,
  );
  if (already) return { skipped: "already_paid" };

  // Referee's monthly base (NGR or GGR per cfg).
  const ngrCents = await engine.fetchPlayerMonthlyBase({
    operatorId: referral.operatorId,
    refereePlayerId: referral.refereePlayerId,
    year,
    month,
    ngrMetric: rewardCfg.crewMetric || "ngr",
  });
  if (ngrCents <= 0) return { skipped: "zero_base" };

  // Referrer's active-crew count = sibling rewarded referrals for the
  // same operator. Includes the referral we're processing — that's
  // intentional, it counts itself once it became rewarded.
  const activeReferralsCount = await PlayerReferral.countDocuments({
    operatorId: referral.operatorId,
    referrerPlayerId: referral.referrerPlayerId,
    status: "rewarded",
  });

  const rewardCents = raReward.compute(rewardCfg, {
    activeReferralsCount,
    ngrCents,
  });
  if (rewardCents <= 0) return { skipped: "zero_reward" };

  const rewardCurrency = referral.rewardCurrency || rewardCfg.currency || "EUR";

  referral.recurringPayments = referral.recurringPayments || [];
  referral.recurringPayments.push({
    year,
    month,
    ngrCents,
    rewardCents,
    rewardCurrency,
    enqueuedAt: new Date(),
  });
  await referral.save();

  // The delivery enqueue helper expects the legacy `recurring` shape
  // (percent / ngrMetric / monthlyCapCents / rewardKind) — synthesize a
  // surface for it from the Crew config so downstream auditing stays
  // consistent.
  const recurringShim = {
    percent: 0,                              // dynamic — surfaced via activeReferralsCount instead
    ngrMetric: rewardCfg.crewMetric || "ngr",
    monthlyCapCents: rewardCfg.crewMonthlyCapCents || null,
    rewardKind: rewardCfg.rewardKind || "cash",
    rewardShape: "crew_tiered",
    activeReferralsCount,
  };
  const delivery = await engine.enqueueRecurringDelivery(
    referral,
    { year, month, ngrCents, rewardCents, rewardCurrency },
    recurringShim,
  );

  const last = referral.recurringPayments[referral.recurringPayments.length - 1];
  last.deliveryId = delivery._id;
  await referral.save();

  return { paid: true };
}

/**
 * Top-level run from the scheduler. Decides whether today is a "run
 * day" and which calendar month to process. Idempotent re-runs on the
 * same day are cheap because of the (year, month) dedup inside
 * processReferral.
 */
async function runOnce({ now = new Date() } = {}) {
  if (now.getUTCDate() < RUN_DAY) {
    logger.debug("referral.recurring.skip_before_run_day", {
      day: now.getUTCDate(),
      runDay: RUN_DAY,
    });
    return { skipped: "before_run_day" };
  }

  // Process the previous calendar month.
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return runForMonth({
    year:  prev.getUTCFullYear(),
    month: prev.getUTCMonth() + 1,
  });
}

function startReferralRecurringJob() {
  if (scheduledTimer) return;
  setTimeout(() => {
    runOnce().catch((err) =>
      logger.error("referral.recurring.initial_failed", {
        error: err?.message || String(err),
      }),
    );
    scheduledTimer = setInterval(() => {
      runOnce().catch((err) =>
        logger.error("referral.recurring.interval_failed", {
          error: err?.message || String(err),
        }),
      );
    }, REFRESH_MS);
    scheduledTimer.unref?.();
  }, INITIAL_DELAY_MS);
  logger.info("referral.recurring.job.started", {
    refreshMs: REFRESH_MS,
    runDay: RUN_DAY,
  });
}

function stopReferralRecurringJob() {
  if (scheduledTimer) {
    clearInterval(scheduledTimer);
    scheduledTimer = null;
  }
}

module.exports = {
  startReferralRecurringJob,
  stopReferralRecurringJob,
  runOnce,
  runForMonth,
};
