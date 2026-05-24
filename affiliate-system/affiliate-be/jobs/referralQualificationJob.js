"use strict";

/**
 * Daily re-evaluation of pending refer-a-friend referrals.
 *
 * Runs once a day (configurable). Walks every PlayerReferral in
 * `pending_qualification` and calls referralEngine.evaluateQualification
 * on it. The engine handles wager fetches, gate evaluation, monthly cap
 * checks, and either transitions the row to qualified (enqueueing a
 * delivery) or leaves it pending for the next sweep.
 *
 * Cheap by design — pending_qualification rows are usually short-lived
 * (they qualify within a few days of FTD or get rejected). For brands
 * with no recent activity, the query returns zero rows.
 */

const PlayerReferral = require("../models/PlayerReferral");
const engine         = require("../engine/referralEngine");
const { logger }     = require("../middlewares/logger");

const REFRESH_MS = parseInt(
  process.env.REFERRAL_QUALIFICATION_JOB_REFRESH_MS || String(24 * 60 * 60 * 1000),
  10,
);
// Wait a couple of minutes after boot before the first run so any
// in-progress migrations / index builds finish first.
const INITIAL_DELAY_MS = parseInt(
  process.env.REFERRAL_QUALIFICATION_JOB_INITIAL_DELAY_MS || String(2 * 60 * 1000),
  10,
);

let scheduledTimer = null;

/**
 * One full sweep. Public for the test suite + manual triggers.
 * Returns counts so callers can see what happened without scraping logs.
 */
async function runOnce() {
  const startedAt = Date.now();
  const stats = { evaluated: 0, qualified: 0, rejected: 0, stillPending: 0, errors: 0 };

  // Stream rather than load-all-into-memory: in pathological cases there
  // could be thousands of pending referrals. Mongoose .cursor() yields
  // one doc at a time without buffering the full result set.
  // Frozen referrals are paused — operator admin lifted the freeze toggle
  // and we'll pick them up on the next run.
  const cursor = PlayerReferral.find({
    status: "pending_qualification",
    $or: [{ frozen: false }, { frozen: { $exists: false } }],
  })
    .sort({ ftdAt: 1 })
    .cursor();

  for await (const referral of cursor) {
    try {
      const updated = await engine.evaluateQualification(referral._id);
      stats.evaluated++;
      if (updated.status === "qualified" || updated.status === "rewarded") stats.qualified++;
      else if (updated.status === "rejected") stats.rejected++;
      else stats.stillPending++;
    } catch (err) {
      stats.errors++;
      logger.error("referral.qualification.evaluate_failed", {
        referralId: String(referral._id),
        error: err?.message || String(err),
      });
    }
  }

  logger.info("referral.qualification.job.ok", {
    ...stats,
    durationMs: Date.now() - startedAt,
  });
  return stats;
}

function startReferralQualificationJob() {
  if (scheduledTimer) return; // idempotent
  setTimeout(() => {
    runOnce().catch((err) =>
      logger.error("referral.qualification.initial_failed", {
        error: err?.message || String(err),
      }),
    );
    scheduledTimer = setInterval(() => {
      runOnce().catch((err) =>
        logger.error("referral.qualification.interval_failed", {
          error: err?.message || String(err),
        }),
      );
    }, REFRESH_MS);
    scheduledTimer.unref?.();
  }, INITIAL_DELAY_MS);
  logger.info("referral.qualification.job.started", { refreshMs: REFRESH_MS });
}

function stopReferralQualificationJob() {
  if (scheduledTimer) {
    clearInterval(scheduledTimer);
    scheduledTimer = null;
  }
}

module.exports = { startReferralQualificationJob, stopReferralQualificationJob, runOnce };
