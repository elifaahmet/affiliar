"use strict";

/**
 * Daily billing reminder sweep.
 *
 * Walks every operator with a `nextBillingDate` set (trial, active, or
 * past_due) and picks the right reminder for where they sit on the
 * timeline:
 *
 *   -7d / -3d   →  upcoming     (monthly cycle heads-up, one-shot each)
 *    0d         →  due_today    (trial end / paid grace expires today)
 *   +2d         →  past_due_2d  (one-shot)
 *   +4d         →  past_due_4d  (one-shot)
 *   +7d         →  suspended    (one-shot, flips status to 'suspended')
 *
 * Trial flow: at signup we set `nextBillingDate = trialEndsAt`, so a
 * 3-day trial maps to: signup → due on day 3 → reminders on day 5/7 →
 * suspended on day 10.
 *
 * Idempotency
 * -----------
 * Each send is logged into `Operator.billingReminders` with a `cycleAnchor`
 * equal to the operator's `nextBillingDate` at the time of send. All
 * stages dedupe on `(kind, cycleAnchor)`. When the operator pays, the
 * billing controller advances `nextBillingDate` — the old log entries no
 * longer match the new cycleAnchor, so the next cycle starts with a clean
 * slate of reminders.
 *
 * Status transitions
 * ------------------
 * - trial/active → past_due  when `nextBillingDate < now` (sets `pastDueAt`).
 * - past_due → suspended     when ≥ SUSPEND_AFTER_DAYS overdue.
 * - {past_due,suspended} → active  is owned by the billing controller (on payment).
 */

const Operator = require("../models/Operator");
const User     = require("../models/User");
const { PLANS } = require("../utils/planLimits");
const {
  sendBillingUpcoming,
  sendBillingDueToday,
  sendBillingPastDueReminder,
  sendBillingSuspendedNotice,
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

// Cut-off threshold: at +N days overdue the operator flips to 'suspended'
// and panel access is blocked until they pay.
const SUSPEND_AFTER_DAYS = 7;

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

let scheduledTimer = null;

// ── Stage picker ─────────────────────────────────────────────────────────────
//
// Given an operator's billing date and the current time, returns either a
// stage descriptor `{ kind, daysUntilDue?, daysOverdue?, daysUntilSuspension? }`
// or null when nothing should fire. Pure function — no I/O.
//
// Trial signups use the same machinery: at signup, nextBillingDate is set
// to trialEndsAt (= signup + 3d), so a trial maps to due_today on day 3,
// past_due_2d on day 5, past_due_4d on day 7, suspended on day 10.
function pickStage(nextBillingDate, now) {
  const deltaMs = nextBillingDate.getTime() - now.getTime();
  const deltaDays = deltaMs / ONE_DAY_MS;

  // ── Pre-due reminders. We use ±0.5-day windows so the daily job fires
  // exactly once per stage regardless of when in the day it runs. These
  // only fire on monthly cycles — a 3-day trial doesn't reach -7/-3d.
  if (deltaDays > 6.5 && deltaDays <= 7.5) {
    return { kind: "upcoming_7d", daysUntilDue: 7 };
  }
  if (deltaDays > 2.5 && deltaDays <= 3.5) {
    return { kind: "upcoming_3d", daysUntilDue: 3 };
  }
  if (deltaDays > -0.5 && deltaDays <= 0.5) {
    return { kind: "due_today", daysUntilDue: 0 };
  }

  // ── Post-due reminders: sparse one-shots at +2 / +4, suspend at +7.
  // Use ±0.5-day windows mirroring the pre-due logic so the daily job
  // catches each stage exactly once.
  if (deltaDays <= -6.5) {
    const daysOverdue = Math.max(SUSPEND_AFTER_DAYS, Math.ceil(-deltaDays));
    return { kind: "suspended", daysOverdue };
  }
  if (deltaDays > -4.5 && deltaDays <= -3.5) {
    return {
      kind: "past_due_4d",
      daysOverdue: 4,
      daysUntilSuspension: SUSPEND_AFTER_DAYS - 4,
    };
  }
  if (deltaDays > -2.5 && deltaDays <= -1.5) {
    return {
      kind: "past_due_2d",
      daysOverdue: 2,
      daysUntilSuspension: SUSPEND_AFTER_DAYS - 2,
    };
  }

  return null; // overdue but not on a reminder day (e.g. +1, +3, +5, +6)
}

// Cycle dedup: an `entry.cycleAnchor` matches when it equals the operator's
// current `nextBillingDate`. Once payment bumps the cycle, old entries are
// from a previous cycleAnchor and no longer block sends.
function sameCycle(entry, nextBillingDate) {
  if (!entry?.cycleAnchor || !nextBillingDate) return false;
  return new Date(entry.cycleAnchor).getTime() === nextBillingDate.getTime();
}

// Returns true if the operator was already reminded for this stage in the
// current cycle. All stages are one-shot per cycleAnchor.
function alreadySent(operator, stage) {
  const log = operator.billingReminders || [];
  const nextBillingDate = operator.nextBillingDate;
  return log.some(
    (e) => e.kind === stage.kind && sameCycle(e, nextBillingDate),
  );
}

// ── Per-operator processing ──────────────────────────────────────────────────

async function processOperator(operator, now) {
  if (!operator.nextBillingDate) return { skipped: "no_next_billing" };

  const stage = pickStage(new Date(operator.nextBillingDate), now);
  if (!stage) return { skipped: "outside_window" };

  // Suppress the monthly-cycle pre-due reminders for trial operators —
  // they just signed up and don't need "renewing soon" emails. They'll get
  // due_today on day 3 and the post-due cadence after that.
  if (operator.billingStatus === "trial"
      && (stage.kind === "upcoming_7d" || stage.kind === "upcoming_3d")) {
    return { skipped: "trial_pre_due_suppressed" };
  }

  // If still `trial` or `active` but we're past due, flip to past_due
  // first so the suspension countdown anchor is recorded (pastDueAt).
  // Pre-due stages (upcoming/due_today) don't trigger the flip.
  const isPostDue =
    stage.kind === "past_due_2d" ||
    stage.kind === "past_due_4d" ||
    stage.kind === "suspended";
  if (isPostDue
      && (operator.billingStatus === "active" || operator.billingStatus === "trial")) {
    const fromStatus = operator.billingStatus;
    await Operator.updateOne(
      { _id: operator._id, billingStatus: fromStatus },
      { $set: { billingStatus: "past_due", pastDueAt: now } },
    );
    operator.billingStatus = "past_due";
    operator.pastDueAt = now;
  }

  // Hard cut-off: flip to 'suspended' before sending so the user's next
  // request hits the suspended-panel gate. One-shot per cycle thanks to
  // alreadySent() — re-runs after suspension just no-op.
  if (stage.kind === "suspended" && operator.billingStatus !== "suspended") {
    await Operator.updateOne(
      { _id: operator._id },
      { $set: { billingStatus: "suspended" } },
    );
    operator.billingStatus = "suspended";
  }

  if (alreadySent(operator, stage)) {
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
        case "past_due_2d":
        case "past_due_4d":
          await sendBillingPastDueReminder({
            ...args,
            daysOverdue: stage.daysOverdue,
            daysUntilSuspension: stage.daysUntilSuspension,
          });
          break;
        case "suspended":
          await sendBillingSuspendedNotice(args);
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
    sent: { upcoming_7d: 0, upcoming_3d: 0, due_today: 0, past_due_2d: 0, past_due_4d: 0, suspended: 0 },
    flipped: 0,
    suspended: 0,
    skipped: 0,
    errors: 0,
  };

  // Pull trial + active + past_due. Trial operators carry a `nextBillingDate
  // = trialEndsAt` so they flow through the same pipeline; suspended
  // operators have already been cut off and don't need further reminders.
  const cursor = Operator.find({
    isDeleted: false,
    billingStatus: { $in: ["trial", "active", "past_due"] },
    nextBillingDate: { $ne: null },
  }).cursor();

  for await (const operator of cursor) {
    stats.candidates++;
    try {
      const before = operator.billingStatus;
      const result = await processOperator(operator, now);
      if (before !== "past_due" && operator.billingStatus === "past_due") stats.flipped++;
      if (before !== "suspended" && operator.billingStatus === "suspended") stats.suspended++;
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
