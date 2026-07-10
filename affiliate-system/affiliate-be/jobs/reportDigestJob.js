"use strict";

/**
 * Report digests — emailed program summaries for operators AND affiliates.
 *
 *   Weekly  (Mondays):  previous Mon–Sun pulse — NGR/GGR, deposits, FTDs,
 *                       registrations, active players + WoW deltas. Operators
 *                       also see their top 3 affiliates.
 *   Monthly (day 3):    previous full month, same metrics + commission
 *                       (operator = owed to affiliates, affiliate = earned).
 *
 * Each recipient picks their cadence via User.digestFrequency
 * ("weekly" | "monthly" | "off", default weekly); the master `emailNotifications`
 * switch still applies. Deduped per operator per period (Operator.digestWeekSent
 * / digestMonthSent) so restarts can't double-send; inactive scopes are skipped.
 *
 * runWeekly/runMonthly accept { force, dryRun } for manual verification.
 */

const Operator = require("../models/Operator");
const User = require("../models/User");
const {
  getOperatorSummary, getAffiliateSummary, getCommissionCents, hasActivity,
} = require("../utils/reportDigest");
const { sendReportDigest } = require("../utils/mailer");
const { logger } = require("../middlewares/logger");

const DAY_MS = 24 * 60 * 60 * 1000;
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const startOfUTCDay = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayLabel = (d) => `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
const digestPref = (u) => u.digestFrequency || "weekly";

// ── Core engine ──────────────────────────────────────────────────────────────
async function sendDigests(opts) {
  const {
    cadence, fromTs, toTs, prevFromTs, prevToTs, label, periodKey,
    dedupField, withCommission, year, month, force = false, dryRun = false,
  } = opts;

  const operators = await Operator.find({ isDeleted: { $ne: true } })
    .select({ name: 1, [dedupField]: 1 }).lean();

  let sent = 0;
  for (const op of operators) {
    if (!force && op[dedupField] === periodKey) continue;

    // Operator digest → owners.
    let opSummary;
    try { opSummary = await getOperatorSummary(op._id, fromTs, toTs); }
    catch (err) { logger.error("digest.op_summary_failed", { operatorId: String(op._id), error: err.message }); continue; }

    if (hasActivity(opSummary)) {
      const opCommission = withCommission ? await getCommissionCents(op._id, year, month).catch(() => null) : null;
      let opPrev = null;
      try { opPrev = await getOperatorSummary(op._id, prevFromTs, prevToTs); } catch { /* deltas optional */ }
      const owners = await User.find({
        operatorId: op._id, role: "operator", isDeleted: { $ne: true },
        $or: [{ brandIds: { $size: 0 } }, { brandIds: { $exists: false } }],
      }).select({ email: 1, name: 1, username: 1, emailNotifications: 1, digestFrequency: 1 }).lean();
      for (const u of owners) {
        if (!u.email || u.emailNotifications === false || digestPref(u) !== cadence) continue;
        if (dryRun) { logger.info("digest.dryRun", { audience: "operator", cadence, to: u.email, operator: op.name }); sent++; continue; }
        try {
          await sendReportDigest({ audience: "operator", cadence, to: u.email, name: u.name || u.username || "", operatorName: op.name, periodLabel: label, summary: opSummary, prev: opPrev, commissionCents: opCommission });
          sent++;
        } catch (err) { logger.error("digest.email_failed", { to: u.email, error: err.message }); }
      }
    }

    // Affiliate digests → each affiliate who opted into this cadence + was active.
    const affiliates = await User.find({ operatorId: op._id, role: "affiliate", isDeleted: { $ne: true } })
      .select({ _id: 1, email: 1, name: 1, username: 1, emailNotifications: 1, digestFrequency: 1 }).lean();
    for (const a of affiliates) {
      if (!a.email || a.emailNotifications === false || digestPref(a) !== cadence) continue;
      let affSummary;
      try { affSummary = await getAffiliateSummary(op._id, a._id, fromTs, toTs); } catch { continue; }
      if (!hasActivity(affSummary)) continue;
      const affCommission = withCommission ? await getCommissionCents(op._id, year, month, a._id).catch(() => null) : null;
      let affPrev = null;
      try { affPrev = await getAffiliateSummary(op._id, a._id, prevFromTs, prevToTs); } catch { /* optional */ }
      if (dryRun) { logger.info("digest.dryRun", { audience: "affiliate", cadence, to: a.email, operator: op.name }); sent++; continue; }
      try {
        await sendReportDigest({ audience: "affiliate", cadence, to: a.email, name: a.name || a.username || "", operatorName: op.name, periodLabel: label, summary: affSummary, prev: affPrev, commissionCents: affCommission });
        sent++;
      } catch (err) { logger.error("digest.aff_email_failed", { to: a.email, error: err.message }); }
    }

    if (!dryRun) await Operator.updateOne({ _id: op._id }, { $set: { [dedupField]: periodKey } });
  }

  logger.info("report.digest.job.ok", { cadence, operators: operators.length, sent, periodKey, dryRun });
  return { operators: operators.length, sent };
}

// ── Weekly (Mondays, previous Mon–Sun) ───────────────────────────────────────
async function runWeekly({ force = false, dryRun = false } = {}) {
  const now = new Date();
  if (!force && now.getUTCDay() !== 1) return; // Monday = 1
  const todayStart = startOfUTCDay(now);
  const weekStart = new Date(todayStart.getTime() - 7 * DAY_MS);
  const prevWeekStart = new Date(weekStart.getTime() - 7 * DAY_MS);
  const lastDay = new Date(todayStart.getTime() - DAY_MS);
  return sendDigests({
    cadence: "weekly",
    fromTs: `${ymd(weekStart)} 00:00:00`,
    toTs: `${ymd(lastDay)} 23:59:59`,
    prevFromTs: `${ymd(prevWeekStart)} 00:00:00`,
    prevToTs: `${ymd(new Date(weekStart.getTime() - DAY_MS))} 23:59:59`,
    label: `${dayLabel(weekStart)}–${dayLabel(lastDay)}`,
    periodKey: ymd(weekStart),
    dedupField: "digestWeekSent",
    withCommission: false,
    force, dryRun,
  });
}

// ── Monthly (day 3, previous full month + commission) ────────────────────────
async function runMonthly({ force = false, dryRun = false } = {}) {
  const now = new Date();
  if (!force && now.getUTCDate() !== 3) return; // day 3 — CH aggregates have settled
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)); // 1st of prev month
  const year = first.getUTCFullYear();
  const month = first.getUTCMonth() + 1; // 1-12
  const monthEnd = new Date(Date.UTC(year, month, 0)); // last day of prev month
  const pFirst = new Date(Date.UTC(year, month - 2, 1)); // 1st of prev-prev month
  const pEnd = new Date(Date.UTC(pFirst.getUTCFullYear(), pFirst.getUTCMonth() + 1, 0));
  return sendDigests({
    cadence: "monthly",
    fromTs: `${ymd(first)} 00:00:00`,
    toTs: `${ymd(monthEnd)} 23:59:59`,
    prevFromTs: `${ymd(pFirst)} 00:00:00`,
    prevToTs: `${ymd(pEnd)} 23:59:59`,
    label: `${MONTHS[month - 1]} ${year}`,
    periodKey: `${year}-${pad(month)}`,
    dedupField: "digestMonthSent",
    withCommission: true, year, month,
    force, dryRun,
  });
}

// ── Schedulers (both run daily; the guards inside pick the right day) ─────────
function makeStarter(name, run, initialMs) {
  let timer = null;
  return function start() {
    setTimeout(() => {
      run().catch((err) => logger.error(`${name}.initial_failed`, { error: err?.message || String(err) }));
      timer = setInterval(() => {
        run().catch((err) => logger.error(`${name}.interval_failed`, { error: err?.message || String(err) }));
      }, 24 * 60 * 60 * 1000);
      timer.unref?.();
    }, initialMs);
    logger.info(`${name}.started`);
  };
}

const startReportDigestJob = makeStarter("report.digest.weekly", runWeekly, parseInt(process.env.REPORT_DIGEST_JOB_INITIAL_DELAY_MS || String(4 * 60 * 1000), 10));
const startMonthlyDigestJob = makeStarter("report.digest.monthly", runMonthly, parseInt(process.env.MONTHLY_DIGEST_JOB_INITIAL_DELAY_MS || String(5 * 60 * 1000), 10));

module.exports = { startReportDigestJob, startMonthlyDigestJob, runWeekly, runMonthly, sendDigests };
