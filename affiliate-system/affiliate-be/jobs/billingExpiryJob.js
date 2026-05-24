"use strict";

/**
 * Daily billing reminder sweep.
 *
 * Walks every operator with a `nextBillingDate` set (active or past_due) and
 * picks the right reminder for where they sit on the timeline:
 *
 *   -7d / -3d   →  upcoming           (heads-up before due, one-shot each)
 *    0d         →  due_today          (paid grace expires today)
 *   +1..+9d     →  past_due_daily     (daily, with suspension countdown)
 *   +10d       →  suspension_warning (final notice, one-shot)
 *
 * Idempotency
 * -----------
 * Each send is logged into `Operator.billingReminders` with a `cycleAnchor`
 * equal to the operator's `nextBillingDate` at the time of send. One-shot
 * stages dedupe on `(kind, cycleAnchor)`; the daily stage additionally
 * dedupes on "sent within the same UTC day". When the operator pays, the
 * billing controller advances `nextBillingDate` — the old log entries no
 * longer match the new cycleAnchor, so the next cycle starts with a clean
 * slate of reminders.
 *
 * Status transitions
 * ------------------
 * - active → past_due  when `nextBillingDate < now` (sets `pastDueAt`).
 * - past_due → active  is owned by the billing controller (on payment).
 *
 * We do NOT auto-flip to `suspended` at +10d — the +10d email is a final
 * warning; actually cutting off panel access is a separate planGuard
 * decision we'll wire when the operator side is ready for it.
 */

const Operator = require("../models/Operator");
const User     = require("../models/User");
const { PLANS } = require("../utils/planLimits");
const {
  sendBillingUpcoming,
  sendBillingDueToday,
  sendBillingPastDueReminder,
  sendBillingSuspensionWarning,
} = require("../utils/mailer");
const { logger } = require("../middlewares/logger");

const REFRESH_MS = parseInt(
  process.env.BILLING_EXPIRY_JOB_REFRESH_MS || String(24 * 60 * 60 * 1000),
  10,
);
const INITIAL_DELAY_MS = parseInt(
  process.env.BILLING_EXPIRY_JOB_INITIAL_DELAY_MS || String(2 * 60 * 1000),
  10,
);

// Suspension countdown anchor — used in past_due_daily email copy and as the
// cut-off threshold for the suspension_warning stage.
const SUSPEND_AFTER_DAYS = 10;

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

let scheduledTimer = null;

// ── Stage picker ─────────────────────────────────────────────────────────────
//
// Given an operator's billing date and the current time, returns either a
// stage descriptor `{ kind, daysUntilDue?, daysOverdue?, daysUntilSuspension? }`
// or null when nothing should fire. Pure function — no I/O.
function pickStage(nextBillingDate, now) {
  const deltaMs = nextBillingDate.getTime() - now.getTime();
  const deltaDays = deltaMs / ONE_DAY_MS;

  // ── Pre-due reminders. We use ±0.5-day windows so the daily job fires
  // exactly once per stage regardless of when in the day it runs.
  if (deltaDays > 6.5 && deltaDays <= 7.5) {
    return { kind: "upcoming_7d", daysUntilDue: 7 };
  }
  if (deltaDays > 2.5 && deltaDays <= 3.5) {
    return { kind: "upcoming_3d", daysUntilDue: 3 };
  }
  if (deltaDays > -0.5 && deltaDays <= 0.5) {
    return { kind: "due_today", daysUntilDue: 0 };
  }

  // ── Post-due reminders.
  if (deltaDays <= -0.5) {
    // daysOverdue = 1 the day after due, 2 the day after, …
    const daysOverdue = Math.max(1, Math.ceil(-deltaDays));
    if (daysOverdue >= SUSPEND_AFTER_DAYS) {
      return { kind: "suspension_warning", daysOverdue };
    }
    return {
      kind: "past_due_daily",
      daysOverdue,
      daysUntilSuspension: SUSPEND_AFTER_DAYS - daysOverdue,
    };
  }

  return null; // nothing to send today
}

// Cycle dedup: an `entry.cycleAnchor` matches when it equals the operator's
// current `nextBillingDate`. Once payment bumps the cycle, old entries are
// from a previous cycleAnchor and no longer block sends.
function sameCycle(entry, nextBillingDate) {
  if (!entry?.cycleAnchor || !nextBillingDate) return false;
  return new Date(entry.cycleAnchor).getTime() === nextBillingDate.getTime();
}

function sameUtcDay(date, now) {
  if (!date) return false;
  return Math.floor(new Date(date).getTime() / ONE_DAY_MS)
       === Math.floor(now.getTime() / ONE_DAY_MS);
}

// Returns true if the operator was already reminded for this stage in the
// current cycle (and, for past_due_daily, today specifically).
function alreadySent(operator, stage, now) {
  const log = operator.billingReminders || [];
  const nextBillingDate = operator.nextBillingDate;

  if (stage.kind === "past_due_daily") {
    return log.some(
      (e) =>
        e.kind === "past_due_daily" &&
        sameCycle(e, nextBillingDate) &&
        sameUtcDay(e.sentAt, now),
    );
  }
  // one-shot stages: any matching kind for this cycleAnchor blocks
  return log.some(
    (e) => e.kind === stage.kind && sameCycle(e, nextBillingDate),
  );
}

// ── Per-operator processing ──────────────────────────────────────────────────

async function processOperator(operator, now) {
  if (!operator.nextBillingDate) return { skipped: "no_next_billing" };

  const stage = pickStage(new Date(operator.nextBillingDate), now);
  if (!stage) return { skipped: "outside_window" };

  // If the operator is still `active` but we're past due, flip first so the
  // suspension countdown anchor is recorded (pastDueAt).
  if (operator.billingStatus === "active"
      && stage.kind !== "upcoming_7d"
      && stage.kind !== "upcoming_3d"
      && stage.kind !== "due_today") {
    await Operator.updateOne(
      { _id: operator._id, billingStatus: "active" },
      { $set: { billingStatus: "past_due", pastDueAt: now } },
    );
    operator.billingStatus = "past_due";
    operator.pastDueAt = now;
  }

  if (alreadySent(operator, stage, now)) {
    return { skipped: "already_sent", kind: stage.kind };
  }

  const users = await User.find({
    operatorId: operator._id,
    role: "operator",
    isDeleted: false,
  })
    .select({ email: 1, name: 1, username: 1 })
    .lean();
  const planName = PLANS[operator.plan]?.name || operator.plan;
  const dueDate = operator.nextBillingDate;

  let emailed = 0;
  for (const u of users) {
    if (!u.email) continue;
    try {
      const args = {
        to: u.email,
        name: u.name || u.username || "",
        planName,
        dueDate,
      };
      switch (stage.kind) {
        case "upcoming_7d":
        case "upcoming_3d":
          await sendBillingUpcoming({ ...args, daysUntilDue: stage.daysUntilDue });
          break;
        case "due_today":
          await sendBillingDueToday(args);
          break;
        case "past_due_daily":
          await sendBillingPastDueReminder({
            ...args,
            daysOverdue: stage.daysOverdue,
            daysUntilSuspension: stage.daysUntilSuspension,
          });
          break;
        case "suspension_warning":
          await sendBillingSuspensionWarning(args);
          break;
      }
      emailed++;
    } catch (err) {
      logger.error("billing.reminder.email_failed", {
        operatorId: String(operator._id),
        kind: stage.kind,
        to: u.email,
        error: err?.message || String(err),
      });
    }
  }

  // Log the send even if 0 users received it — that way we don't loop on an
  // operator that has no email-able users. The log row records intent.
  await Operator.updateOne(
    { _id: operator._id },
    {
      $push: {
        billingReminders: {
          kind: stage.kind,
          cycleAnchor: dueDate,
          sentAt: now,
        },
      },
    },
  );

  return { kind: stage.kind, emailed };
}

// ── Top-level run ────────────────────────────────────────────────────────────

async function runOnce({ now = new Date() } = {}) {
  const stats = {
    candidates: 0,
    sent: { upcoming_7d: 0, upcoming_3d: 0, due_today: 0, past_due_daily: 0, suspension_warning: 0 },
    flipped: 0,
    skipped: 0,
    errors: 0,
  };

  // Pull both active and past_due — pre-due reminders fire on active, the
  // post-due cadence on past_due. Operators without a nextBillingDate yet
  // (still on trial) are filtered out at the query.
  const cursor = Operator.find({
    isDeleted: false,
    billingStatus: { $in: ["active", "past_due"] },
    nextBillingDate: { $ne: null },
  }).cursor();

  for await (const operator of cursor) {
    stats.candidates++;
    try {
      const before = operator.billingStatus;
      const result = await processOperator(operator, now);
      if (before === "active" && operator.billingStatus === "past_due") stats.flipped++;
      if (result?.kind) stats.sent[result.kind] = (stats.sent[result.kind] || 0) + 1;
      else stats.skipped++;
    } catch (err) {
      stats.errors++;
      logger.error("billing.reminder.row_failed", {
        operatorId: String(operator._id),
        error: err?.message || String(err),
      });
    }
  }

  logger.info("billing.reminder.job.ok", stats);
  return stats;
}

function startBillingExpiryJob() {
  if (scheduledTimer) return; // idempotent
  setTimeout(() => {
    runOnce().catch((err) =>
      logger.error("billing.reminder.initial_failed", {
        error: err?.message || String(err),
      }),
    );
    scheduledTimer = setInterval(() => {
      runOnce().catch((err) =>
        logger.error("billing.reminder.interval_failed", {
          error: err?.message || String(err),
        }),
      );
    }, REFRESH_MS);
    scheduledTimer.unref?.();
  }, INITIAL_DELAY_MS);
  logger.info("billing.reminder.job.started", { refreshMs: REFRESH_MS });
}

function stopBillingExpiryJob() {
  if (scheduledTimer) {
    clearInterval(scheduledTimer);
    scheduledTimer = null;
  }
}

module.exports = { startBillingExpiryJob, stopBillingExpiryJob, runOnce, pickStage };
