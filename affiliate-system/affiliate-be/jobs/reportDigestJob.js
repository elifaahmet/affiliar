"use strict";

/**
 * Weekly report digest.
 *
 * Every Monday (UTC) each operator's owners get an email summarising the
 * previous 7 days (Mon–Sun): NGR/GGR, deposits, FTDs, registrations, active
 * players — with week-over-week deltas and the top 3 affiliates. Keeps
 * operators engaged without logging in, and nudges them back to full reports.
 *
 * Runs daily but only acts on Mondays; `Operator.digestWeekSent` (the reported
 * week's Monday key) dedupes so a restart can't double-send. Operators with no
 * activity that week are skipped (but still marked, to avoid recompute). Honours
 * the owner's `emailNotifications` master switch + `notificationPrefs.report_digest`.
 *
 * Options: runOnce({ force }) ignores the Monday/dedupe guards; runOnce({ dryRun })
 * computes + logs recipients without sending — both for manual verification.
 */

const Operator = require("../models/Operator");
const User = require("../models/User");
const { getOperatorSummary, hasActivity } = require("../utils/reportDigest");
const { sendWeeklyDigest } = require("../utils/mailer");
const { logger } = require("../middlewares/logger");

const REFRESH_MS = parseInt(
  process.env.REPORT_DIGEST_JOB_REFRESH_MS || String(24 * 60 * 60 * 1000),
  10,
);
const INITIAL_DELAY_MS = parseInt(
  process.env.REPORT_DIGEST_JOB_INITIAL_DELAY_MS || String(4 * 60 * 1000),
  10,
);

let scheduledTimer = null;

const DAY_MS = 24 * 60 * 60 * 1000;
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const startOfUTCDay = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function periodLabel(startDate, endDate) {
  const a = `${MONTHS[startDate.getUTCMonth()]} ${startDate.getUTCDate()}`;
  const b = `${MONTHS[endDate.getUTCMonth()]} ${endDate.getUTCDate()}`;
  return `${a}–${b}`;
}

async function runOnce({ force = false, dryRun = false } = {}) {
  const now = new Date();
  if (!force && now.getUTCDay() !== 1) return; // Mondays only (1 = Monday)

  // Report the last full 7 days: [today-7d 00:00, yesterday 23:59:59].
  const todayStart = startOfUTCDay(now);
  const weekStart = new Date(todayStart.getTime() - 7 * DAY_MS);
  const prevWeekStart = new Date(weekStart.getTime() - 7 * DAY_MS);
  const fromTs = `${ymd(weekStart)} 00:00:00`;
  const toTs = `${ymd(new Date(todayStart.getTime() - DAY_MS))} 23:59:59`;
  const prevFromTs = `${ymd(prevWeekStart)} 00:00:00`;
  const prevToTs = `${ymd(new Date(weekStart.getTime() - DAY_MS))} 23:59:59`;
  const weekKey = ymd(weekStart);
  const label = periodLabel(weekStart, new Date(todayStart.getTime() - DAY_MS));

  const operators = await Operator.find({ isDeleted: { $ne: true } })
    .select({ name: 1, digestWeekSent: 1 })
    .lean();

  let sent = 0;
  for (const op of operators) {
    if (!force && op.digestWeekSent === weekKey) continue;

    let summary;
    try {
      summary = await getOperatorSummary(op._id, fromTs, toTs);
    } catch (err) {
      logger.error("reportDigest.summary_failed", { operatorId: String(op._id), error: err.message });
      continue;
    }

    if (!hasActivity(summary)) {
      if (!dryRun) await Operator.updateOne({ _id: op._id }, { $set: { digestWeekSent: weekKey } });
      continue;
    }

    let prev = null;
    try { prev = await getOperatorSummary(op._id, prevFromTs, prevToTs); } catch { /* deltas optional */ }

    const owners = await User.find({
      operatorId: op._id,
      role: "operator",
      isDeleted: { $ne: true },
      $or: [{ brandIds: { $size: 0 } }, { brandIds: { $exists: false } }],
    }).select({ email: 1, name: 1, username: 1, emailNotifications: 1, notificationPrefs: 1 }).lean();

    for (const u of owners) {
      if (!u.email) continue;
      if (u.emailNotifications === false) continue;
      if (u.notificationPrefs && u.notificationPrefs.report_digest === false) continue;
      if (dryRun) { logger.info("reportDigest.dryRun", { to: u.email, operator: op.name, weekKey, ngrCents: summary.ngrCents }); sent++; continue; }
      try {
        await sendWeeklyDigest({
          to: u.email, name: u.name || u.username || "", operatorName: op.name,
          periodLabel: label, summary, prev,
        });
        sent++;
      } catch (err) {
        logger.error("reportDigest.email_failed", { to: u.email, error: err.message });
      }
    }

    if (!dryRun) await Operator.updateOne({ _id: op._id }, { $set: { digestWeekSent: weekKey } });
  }

  logger.info("report.digest.job.ok", { operators: operators.length, sent, weekKey, dryRun });
}

function startReportDigestJob() {
  setTimeout(() => {
    runOnce().catch((err) => logger.error("report.digest.initial_failed", { error: err?.message || String(err) }));
    scheduledTimer = setInterval(() => {
      runOnce().catch((err) => logger.error("report.digest.interval_failed", { error: err?.message || String(err) }));
    }, REFRESH_MS);
    scheduledTimer.unref?.();
  }, INITIAL_DELAY_MS);
  logger.info("report.digest.job.started", { refreshMs: REFRESH_MS });
}

function stopReportDigestJob() {
  if (scheduledTimer) { clearInterval(scheduledTimer); scheduledTimer = null; }
}

module.exports = { startReportDigestJob, stopReportDigestJob, runOnce };
