"use strict";

/**
 * Stale-referral expiry. Sweeps two kinds of dead-end referrals daily:
 *
 *   1. `pending_ftd` rows older than N days  — friend signed up via a
 *      referral code but never made a first deposit. Past the cutoff the
 *      referral is abandoned — operator's casino and our records both
 *      reach equilibrium with status='rejected', reason='signup_no_ftd'.
 *
 *   2. `pending_qualification` rows older than N days — friend deposited
 *      but never met the wager floor (or hold + wager combination). The
 *      qualification job will keep re-evaluating forever otherwise; this
 *      sweep cuts the loop. Reason='expired_no_qualify'.
 *
 * The cutoff is the same N (REFERRAL_EXPIRY_DAYS, default 90) for both
 * paths but anchored differently — signedUpAt for path 1, ftdAt for
 * path 2 — because that's the natural "start of waiting" for each.
 *
 * No webhook is fired for either transition (nothing was paid).
 */

const PlayerReferral = require("../models/PlayerReferral");
const { logger }     = require("../middlewares/logger");

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const EXPIRY_DAYS = parseInt(process.env.REFERRAL_EXPIRY_DAYS || "90", 10);
const REFRESH_MS  = parseInt(
  process.env.REFERRAL_EXPIRY_JOB_REFRESH_MS || String(24 * 60 * 60 * 1000),
  10,
);
// Run a few minutes after boot so it doesn't collide with the
// qualification job's initial pass at +2min.
const INITIAL_DELAY_MS = parseInt(
  process.env.REFERRAL_EXPIRY_JOB_INITIAL_DELAY_MS || String(5 * 60 * 1000),
  10,
);

let scheduledTimer = null;

/**
 * Run a single sweep. Public for tests + ad-hoc operator triggers.
 * Returns counts so callers can see what happened without scraping logs.
 */
async function runOnce({ now = new Date(), expiryDays = EXPIRY_DAYS } = {}) {
  const cutoffMs = now.getTime() - expiryDays * MS_PER_DAY;
  const cutoff   = new Date(cutoffMs);

  const signupResult = await PlayerReferral.updateMany(
    {
      status: "pending_ftd",
      // Most rows have signedUpAt set; defensively fall back to createdAt
      // (Mongoose timestamp) for any pre-Phase-1 rows that might predate
      // the signedUpAt convention.
      $or: [
        { signedUpAt: { $lt: cutoff } },
        { signedUpAt: null, createdAt: { $lt: cutoff } },
      ],
    },
    { $set: { status: "rejected", rejectionReason: "signup_no_ftd" } },
  );

  const qualifyResult = await PlayerReferral.updateMany(
    {
      status: "pending_qualification",
      ftdAt: { $lt: cutoff },
    },
    { $set: { status: "rejected", rejectionReason: "expired_no_qualify" } },
  );

  const stats = {
    signupAbandoned: signupResult.modifiedCount || 0,
    qualifyExpired:  qualifyResult.modifiedCount || 0,
    cutoff:          cutoff.toISOString(),
    expiryDays,
  };
  logger.info("referral.expiry.job.ok", stats);
  return stats;
}

function startReferralExpiryJob() {
  if (scheduledTimer) return; // idempotent
  setTimeout(() => {
    runOnce().catch((err) =>
      logger.error("referral.expiry.initial_failed", {
        error: err?.message || String(err),
      }),
    );
    scheduledTimer = setInterval(() => {
      runOnce().catch((err) =>
        logger.error("referral.expiry.interval_failed", {
          error: err?.message || String(err),
        }),
      );
    }, REFRESH_MS);
    scheduledTimer.unref?.();
  }, INITIAL_DELAY_MS);
  logger.info("referral.expiry.job.started", {
    refreshMs: REFRESH_MS,
    expiryDays: EXPIRY_DAYS,
  });
}

function stopReferralExpiryJob() {
  if (scheduledTimer) {
    clearInterval(scheduledTimer);
    scheduledTimer = null;
  }
}

module.exports = { startReferralExpiryJob, stopReferralExpiryJob, runOnce };
