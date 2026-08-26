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
 *   +1/3/5/7d   →  past_due_Nd  (one-shot each, counting down to suspension)
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
const interestRate = require("../utils/interestRate");
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
const SUSPEND_AFTER_DAYS = 10;

// Reminder cadence, in days relative to the due date. Positive = before due,
// negative = after. Adding or moving a reminder is a one-line edit here; the
// picker below is generic over this table.
const PRE_DUE_DAYS  = [7, 5, 3, 1];
const POST_DUE_DAYS = [1, 3, 5, 7];

// Interest accrued on an overdue invoice, at the daily rate derived from SOFR
// plus a margin (see utils/interestRate). Returns whole cents.
function accruedInterestCents(plan, daysOverdue) {
  const priceUsd = PLANS[plan]?.priceUsd;
  const daily = interestRate.dailyPercent();
  if (!priceUsd || !(daily > 0) || !(daysOverdue > 0)) return 0;
  return Math.round(priceUsd * 100 * (daily / 100) * daysOverdue);
}

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
// the post-due cadence after that, and suspension on day 13.
function pickStage(nextBillingDate, now) {
  // Compare calendar days, not elapsed hours. With fractional days a job
  // running at noon against a midnight due date lands half a day early, so
  // "due today" went out the day before the invoice was actually due.
  // Normalising both ends to UTC midnight makes each stage fire on its real
  // date whatever time the job happens to run.
  const startOfDayUtc = (d) =>
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const deltaDays = Math.round(
    (startOfDayUtc(nextBillingDate) - startOfDayUtc(now)) / ONE_DAY_MS,
  );

  const within = (target) => deltaDays === target;

  // ── Pre-due reminders. Only monthly cycles reach the far ones; a 3-day
  // trial simply never sits 7 days from its due date.
  for (const d of PRE_DUE_DAYS) {
    if (within(d)) return { kind: `upcoming_${d}d`, daysUntilDue: d };
  }
  if (within(0)) return { kind: "due_today", daysUntilDue: 0 };

  // ── Suspension. Checked before the post-due reminders so that an operator
  // who is far past due lands here rather than on a reminder window.
  if (deltaDays <= -SUSPEND_AFTER_DAYS) {
    const daysOverdue = Math.max(SUSPEND_AFTER_DAYS, -deltaDays);
    return { kind: "suspended", daysOverdue };
  }

  // ── Post-due reminders, counting down to suspension.
  for (const d of POST_DUE_DAYS) {
    if (within(-d)) {
      return {
        kind: `past_due_${d}d`,
        daysOverdue: d,
        daysUntilSuspension: SUSPEND_AFTER_DAYS - d,
      };
    }
  }

  return null; // overdue but not on a reminder day (e.g. +2, +4, +6)
}

// Stage kinds grouped, so callers don't re-derive them from string shapes.
const PRE_DUE_KINDS  = PRE_DUE_DAYS.map((d) => `upcoming_${d}d`);
const POST_DUE_KINDS = POST_DUE_DAYS.map((d) => `past_due_${d}d`);

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

// Who the dunning cadence applies to. Named and exported because the two
// exclusions are the whole safety story: getting either wrong emails or
// suspends a customer who owes us nothing.
const DUNNING_FILTER = {
  isDeleted: false,
  billingStatus: { $in: ["trial", "active", "past_due"] },
  nextBillingDate: { $ne: null },
  lifetimeFree: { $ne: true },
  offlineBilling: { $ne: true },
};

// ── Per-operator processing ──────────────────────────────────────────────────

async function processOperator(operator, now) {
  if (!operator.nextBillingDate) return { skipped: "no_next_billing" };

  const stage = pickStage(new Date(operator.nextBillingDate), now);
  if (!stage) return { skipped: "outside_window" };

  // Suppress the monthly-cycle pre-due reminders for trial operators —
  // they just signed up and don't need "renewing soon" emails. They'll get
  // due_today on day 3 and the post-due cadence after that.
  if (operator.billingStatus === "trial"
      && PRE_DUE_KINDS.includes(stage.kind)) {
    return { skipped: "trial_pre_due_suppressed" };
  }

  // If still `trial` or `active` but we're past due, flip to past_due
  // first so the suspension countdown anchor is recorded (pastDueAt).
  // Pre-due stages (upcoming/due_today) don't trigger the flip.
  const isPostDue = POST_DUE_KINDS.includes(stage.kind) || stage.kind === "suspended";
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
      if (PRE_DUE_KINDS.includes(stage.kind)) {
        await sendBillingUpcoming({ ...args, daysUntilDue: stage.daysUntilDue });
      } else if (stage.kind === "due_today") {
        await sendBillingDueToday(args);
      } else if (POST_DUE_KINDS.includes(stage.kind)) {
        await sendBillingPastDueReminder({
          ...args,
          daysOverdue: stage.daysOverdue,
          daysUntilSuspension: stage.daysUntilSuspension,
          interestCents: accruedInterestCents(operator.plan, stage.daysOverdue),
          rate: interestRate.describe(),
          suspendAfterDays: SUSPEND_AFTER_DAYS,
        });
      } else if (stage.kind === "suspended") {
        await sendBillingSuspendedNotice({
          ...args,
          daysOverdue: stage.daysOverdue,
          interestCents: accruedInterestCents(operator.plan, stage.daysOverdue),
          rate: interestRate.describe(),
        });
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
    sent: Object.fromEntries(
      [...PRE_DUE_KINDS, "due_today", ...POST_DUE_KINDS, "suspended"].map((k) => [k, 0]),
    ),
    flipped: 0,
    suspended: 0,
    skipped: 0,
    errors: 0,
  };

  // Pull trial + active + past_due. Trial operators carry a `nextBillingDate
  // = trialEndsAt` so they flow through the same pipeline; suspended
  // operators have already been cut off and don't need further reminders.
  // Lifetime-free operators (e.g. our own Hexora tenant) bypass billing
  // entirely — no reminders, no past_due flip, no suspend. Operators billed
  // offline are excluded for the opposite reason: they do pay, but never
  // through us, so the system can't tell a settled invoice from an unpaid one
  // and would suspend a paid-up customer on schedule.
  const cursor = Operator.find(DUNNING_FILTER).cursor();

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

module.exports = { DUNNING_FILTER, startBillingExpiryJob, stopBillingExpiryJob, runOnce, pickStage, accruedInterestCents };
