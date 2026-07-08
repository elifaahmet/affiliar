"use strict";

/**
 * Player-limit warning sweep.
 *
 * Cost/value scales with monthly active players (MAP), so each plan carries a
 * `maxPlayers` cap. This job warns operators as they approach it — graduated
 * thresholds that get denser near the cap so there are no surprises:
 *
 *   60% · 70% · 80% · 84% · 88% · 92% · 96% · 98% · 100%
 *
 * (e.g. a 2,500-cap tier1 fires at 1500/1750/2000/2100/2200/2300/2400/2450/2500.)
 *
 * Each threshold sends at most once per calendar month (UTC) via
 * `Operator.playerUsageAlerts { cycleMonth, sent }`. When the month rolls over,
 * `sent` resets and warnings re-fire as usage climbs again. notifyOperatorOwners
 * delivers both the in-app notification and the email (subject to prefs).
 *
 * Soft only — this job never blocks the panel; it just nudges to upgrade.
 * lifetimeFree tenants and plans without a cap are skipped.
 */

const Operator = require("../models/Operator");
const { getPlan } = require("../utils/planLimits");
const { getMonthlyActivePlayers } = require("../utils/playerUsage");
const { notifyOperatorOwners } = require("../utils/notify");
const { logger } = require("../middlewares/logger");

const THRESHOLDS = [60, 70, 80, 84, 88, 92, 96, 98, 100];

const REFRESH_MS = parseInt(
  process.env.PLAYER_USAGE_JOB_REFRESH_MS || String(6 * 60 * 60 * 1000),
  10,
);
const INITIAL_DELAY_MS = parseInt(
  process.env.PLAYER_USAGE_JOB_INITIAL_DELAY_MS || String(3 * 60 * 1000),
  10,
);

let scheduledTimer = null;

function cycleMonthUTC(now = new Date()) {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function runOnce() {
  const cycleMonth = cycleMonthUTC();
  const operators = await Operator.find({
    isDeleted: { $ne: true },
    lifetimeFree: { $ne: true },
  })
    .select({ plan: 1, playerUsageAlerts: 1 })
    .lean();

  let warned = 0;
  for (const op of operators) {
    const cap = getPlan(op.plan)?.maxPlayers;
    if (!cap) continue;

    let alerts = op.playerUsageAlerts || { cycleMonth: null, sent: [] };
    if (alerts.cycleMonth !== cycleMonth) alerts = { cycleMonth, sent: [] };

    let map;
    try {
      map = await getMonthlyActivePlayers(op._id);
    } catch (err) {
      logger.error("playerUsage.map_failed", { operatorId: String(op._id), error: err.message });
      continue;
    }
    const pct = (map / cap) * 100;

    const crossed = THRESHOLDS.filter((t) => pct >= t && !alerts.sent.includes(t));

    // Persist a month reset even when nothing new crossed, so `sent` stays fresh.
    if (!crossed.length) {
      if (op.playerUsageAlerts?.cycleMonth !== cycleMonth) {
        await Operator.updateOne({ _id: op._id }, { $set: { playerUsageAlerts: alerts } });
      }
      continue;
    }

    const highest = Math.max(...crossed);
    const planName = getPlan(op.plan)?.name || op.plan;
    const reached = highest >= 100;
    try {
      await notifyOperatorOwners(op._id, {
        type: "player_usage",
        title: reached
          ? "You've reached your plan's player limit"
          : `You've used ${highest}% of your player limit`,
        body:
          `${map.toLocaleString("en-US")} of ${cap.toLocaleString("en-US")} monthly active players ` +
          `used on your ${planName} plan. Upgrade to keep tracking every player without interruption.`,
        link: "/billing",
      });
      warned++;
    } catch (err) {
      logger.error("playerUsage.notify_failed", { operatorId: String(op._id), error: err.message });
      continue;
    }

    alerts.sent = [...alerts.sent, ...crossed].sort((a, b) => a - b);
    await Operator.updateOne({ _id: op._id }, { $set: { playerUsageAlerts: alerts } });
  }

  logger.info("player.usage.job.ok", { operators: operators.length, warned });
}

function startPlayerUsageJob() {
  setTimeout(() => {
    runOnce().catch((err) =>
      logger.error("player.usage.initial_failed", { error: err?.message || String(err) }),
    );
    scheduledTimer = setInterval(() => {
      runOnce().catch((err) =>
        logger.error("player.usage.interval_failed", { error: err?.message || String(err) }),
      );
    }, REFRESH_MS);
    scheduledTimer.unref?.();
  }, INITIAL_DELAY_MS);
  logger.info("player.usage.job.started", { refreshMs: REFRESH_MS });
}

function stopPlayerUsageJob() {
  if (scheduledTimer) {
    clearInterval(scheduledTimer);
    scheduledTimer = null;
  }
}

module.exports = { startPlayerUsageJob, stopPlayerUsageJob, runOnce };
