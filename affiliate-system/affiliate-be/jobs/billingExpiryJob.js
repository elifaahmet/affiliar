"use strict";

/**
 * Daily sweep that flips subscriptions past_due once they overshoot
 * `nextBillingDate`, and emails the operator's users so they know to pay.
 *
 * Transition-only: the matcher requires billingStatus === "active" AND
 * nextBillingDate < now. After the flip the operator is "past_due", so the
 * next run won't re-email — they get a single notification at the moment
 * the cycle expires, not a daily nag.
 *
 * Operator → past_due is only a soft signal here; whether to actually limit
 * access is the planGuard's call (and a follow-up — for now it's UX only).
 */

const Operator = require("../models/Operator");
const User     = require("../models/User");
const { PLANS } = require("../utils/planLimits");
const { sendBillingPastDue } = require("../utils/mailer");
const { logger } = require("../middlewares/logger");

const REFRESH_MS = parseInt(
  process.env.BILLING_EXPIRY_JOB_REFRESH_MS || String(24 * 60 * 60 * 1000),
  10,
);
const INITIAL_DELAY_MS = parseInt(
  process.env.BILLING_EXPIRY_JOB_INITIAL_DELAY_MS || String(2 * 60 * 1000),
  10,
);

let scheduledTimer = null;

async function runOnce({ now = new Date() } = {}) {
  const expired = await Operator.find({
    isDeleted: false,
    billingStatus: "active",
    nextBillingDate: { $ne: null, $lt: now },
  })
    .select({ _id: 1, name: 1, plan: 1, nextBillingDate: 1 })
    .lean();

  if (expired.length === 0) {
    logger.info("billing.expiry.job.ok", { expired: 0 });
    return { expired: 0, emailed: 0 };
  }

  const operatorIds = expired.map((o) => o._id);

  // Flip in bulk first — even if emails fail later, the status is correct
  // (idempotent: rerun won't re-match these operators because they're no
  // longer "active").
  const flip = await Operator.updateMany(
    { _id: { $in: operatorIds }, billingStatus: "active" },
    { $set: { billingStatus: "past_due" } },
  );

  let emailed = 0;
  for (const op of expired) {
    try {
      const users = await User.find({
        operatorId: op._id,
        role: "operator",
        isDeleted: false,
      })
        .select({ email: 1, name: 1, username: 1 })
        .lean();
      const planName = PLANS[op.plan]?.name || op.plan;
      for (const u of users) {
        if (!u.email) continue;
        await sendBillingPastDue({
          to: u.email,
          name: u.name || u.username || "",
          planName,
          dueDate: op.nextBillingDate,
        });
        emailed++;
      }
    } catch (err) {
      // Mailer failures shouldn't roll back the status flip.
      logger.error("billing.expiry.email_failed", {
        operatorId: String(op._id),
        error: err?.message || String(err),
      });
    }
  }

  logger.info("billing.expiry.job.ok", {
    expired: flip.modifiedCount ?? expired.length,
    emailed,
  });
  return { expired: flip.modifiedCount ?? expired.length, emailed };
}

function startBillingExpiryJob() {
  if (scheduledTimer) return; // idempotent
  setTimeout(() => {
    runOnce().catch((err) =>
      logger.error("billing.expiry.initial_failed", {
        error: err?.message || String(err),
      }),
    );
    scheduledTimer = setInterval(() => {
      runOnce().catch((err) =>
        logger.error("billing.expiry.interval_failed", {
          error: err?.message || String(err),
        }),
      );
    }, REFRESH_MS);
    scheduledTimer.unref?.();
  }, INITIAL_DELAY_MS);
  logger.info("billing.expiry.job.started", { refreshMs: REFRESH_MS });
}

function stopBillingExpiryJob() {
  if (scheduledTimer) {
    clearInterval(scheduledTimer);
    scheduledTimer = null;
  }
}

module.exports = { startBillingExpiryJob, stopBillingExpiryJob, runOnce };
