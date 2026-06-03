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
  // Crew (tiered) reward branch — when the referee's qualifying config chose
  // reward.type === "crew_tiered", the monthly payout uses the referrer's
  // current active-crew count, not a static percent. Unlike the flat
  // recurringReward path below (pinned to the qualify-time snapshot so plan
  // changes aren't retroactive), Crew tiers/caps follow the LIVE config: the
  // tier mechanic is already "current state" (the active-crew count is live)
  // and the operator dashboard shows live tiers, so a threshold/percent change
  // applies to the whole crew on the next run.
  const snapReward = referral.configSnapshot && referral.configSnapshot.reward;
  const liveConfig = await ReferAFriendConfig.findOne({ brandId: referral.brandId });
  const liveReward = liveConfig && liveConfig.reward;

  // A referral "is crew" if it qualified under crew_tiered (its snapshot), or
  // — for old referrals with no snapshot — the live config is crew.
  const isCrew =
    (snapReward && snapReward.type === "crew_tiered") ||
    ((!snapReward || !snapReward.type) && liveReward && liveReward.type === "crew_tiered");

  if (isCrew) {
    // Prefer live crew config; fall back to the snapshot only if the operator
    // has since deleted or re-typed the config away from crew_tiered.
    const rewardCfg =
      liveReward && liveReward.type === "crew_tiered" ? liveReward : snapReward;
    if (rewardCfg) return processCrewReferral(referral, { year, month, rewardCfg });
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
 * Crew (tiered) variant of processReferral. Crew is an AGGREGATE game: the
 * referrer is paid once per month on the TOTAL netted NGR of their whole
 * active crew (winners net against losers), with the percent set by how many
 * active crew members they have (via crewLevels). This is NOT per-referee —
 * the monthly cursor visits each member, but only the lowest-_id member (the
 * "anchor") runs the aggregation and enqueues the single payout; the rest
 * short-circuit. Idempotency is per-referrer-per-month (checked across the
 * whole crew, since the anchor can shift as the crew changes).
 *
 * Active crew = referrer's rewarded, non-frozen referrals (operator-scoped).
 * Counted at run time so a referrer who climbs a level mid-month gets the
 * higher rate next run, not retroactively. Payment row is written first,
 * delivery enqueued second, deliveryId back-filled — same as the legacy path.
 */
async function processCrewReferral(referral, { year, month, rewardCfg }) {
  // Crew pays the referrer ONE netted amount per month, but recorded as a
  // per-referee breakdown (each member's NGR × tier%, summing to the payout).
  // The monthly cursor visits each crew member, so we do the work exactly once
  // per referrer by anchoring on the lowest-_id member; the rest short-circuit.
  // Active crew = rewarded, non-frozen referrals (operator-scoped).
  const crew = await PlayerReferral.find({
    operatorId: referral.operatorId,
    referrerPlayerId: referral.referrerPlayerId,
    status: "rewarded",
    $or: [{ frozen: false }, { frozen: { $exists: false } }],
  })
    .sort({ _id: 1 })
    .lean();
  if (!crew.length) return { skipped: "no_crew" };
  if (String(crew[0]._id) !== String(referral._id)) {
    return { skipped: "aggregated_under_anchor" };
  }

  // Idempotency is per-referrer-per-month. The aggregate payment row lives on
  // whichever member is the anchor that run, and the anchor can shift as the
  // crew changes — so check across the whole crew, not just this referral.
  const alreadyPaid = await PlayerReferral.exists({
    operatorId: referral.operatorId,
    referrerPlayerId: referral.referrerPlayerId,
    recurringPayments: { $elemMatch: { year, month } },
  });
  if (alreadyPaid) return { skipped: "already_paid" };

  const activeReferralsCount = crew.length;
  const rewardCurrency = referral.rewardCurrency || rewardCfg.currency || "EUR";

  // Resolve the referrer's current Crew tier from the live table. Levels are
  // 1-based; below the lowest threshold percent = 0.
  const sortedLevels = [...(rewardCfg.crewLevels || [])].sort(
    (a, b) => (Number(a.activeReferrals) || 0) - (Number(b.activeReferrals) || 0),
  );
  let crewLevel = 0;
  let crewThreshold = 0;
  let crewPercent = 0;
  let crewNextLevel = null;
  for (let i = 0; i < sortedLevels.length; i++) {
    const lvl = sortedLevels[i];
    if (activeReferralsCount >= (Number(lvl.activeReferrals) || 0)) {
      crewLevel = i + 1;
      crewThreshold = Number(lvl.activeReferrals) || 0;
      crewPercent = Number(lvl.percent) || 0;
    } else {
      crewNextLevel = {
        level: i + 1,
        activeReferrals: Number(lvl.activeReferrals) || 0,
        percent: Number(lvl.percent) || 0,
      };
      break;
    }
  }

  // Per-referee signed NGR so each member's own NGR × tier% breakdown is
  // recorded (and the activity view can show it). The rows sum to the
  // referrer's netted payout: a member who beat the house contributes a
  // negative row and shrinks the total.
  const perRefMap = await engine.fetchCrewMonthlyBasePerReferee({
    operatorId: referral.operatorId,
    refereePlayerIds: crew.map((c) => c.refereePlayerId),
    year,
    month,
    ngrMetric: rewardCfg.crewMetric || "ngr",
  });

  const enqueuedAt = new Date();
  const perReferee = crew.map((c) => {
    const ngr = perRefMap.get(String(c.refereePlayerId)) || 0;
    return {
      referralId: c._id,
      ngrCents: ngr,
      rewardCents: Math.floor((ngr * crewPercent) / 100), // signed; per-referee share
    };
  });

  const totalNgr = perReferee.reduce((s, r) => s + r.ngrCents, 0);
  if (totalNgr <= 0) return { skipped: "zero_base" };

  let totalReward = perReferee.reduce((s, r) => s + r.rewardCents, 0);
  const cap = rewardCfg.crewMonthlyCapCents;
  if (cap && cap > 0 && totalReward > cap) totalReward = cap; // per-referrer monthly cap
  if (totalReward <= 0) return { skipped: "zero_reward" };

  // Record the per-referee breakdown on each crew referral so the activity
  // view shows "this referee: NGR × tier% = reward". deliveryId is back-filled
  // after the single aggregate delivery is enqueued.
  await PlayerReferral.bulkWrite(
    perReferee.map((r) => ({
      updateOne: {
        filter: { _id: r.referralId },
        update: {
          $push: {
            recurringPayments: {
              year,
              month,
              ngrCents: r.ngrCents,
              rewardCents: r.rewardCents,
              percent: crewPercent,
              rewardCurrency,
              enqueuedAt,
            },
          },
        },
      },
    })),
  );

  // ONE aggregate delivery to the referrer for the netted total. The crew
  // block rides along so the pull API can show the referrer's current level.
  const recurringShim = {
    percent: 0, // dynamic — surfaced via crew.percent instead
    ngrMetric: rewardCfg.crewMetric || "ngr",
    monthlyCapCents: rewardCfg.crewMonthlyCapCents || null,
    rewardKind: rewardCfg.rewardKind || "cash",
    rewardShape: "crew_tiered",
    crew: {
      level: crewLevel,
      activeReferrals: activeReferralsCount,
      threshold: crewThreshold,
      percent: crewPercent,
      metric: rewardCfg.crewMetric || "ngr",
      nextLevel: crewNextLevel,
    },
  };
  const delivery = await engine.enqueueRecurringDelivery(
    referral,
    { year, month, ngrCents: totalNgr, rewardCents: totalReward, rewardCurrency },
    recurringShim,
  );

  // Back-fill the deliveryId on the rows we just pushed for this period.
  await PlayerReferral.bulkWrite(
    perReferee.map((r) => ({
      updateOne: {
        filter: { _id: r.referralId },
        update: { $set: { "recurringPayments.$[e].deliveryId": delivery._id } },
        arrayFilters: [{ "e.year": year, "e.month": month }],
      },
    })),
  );

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
