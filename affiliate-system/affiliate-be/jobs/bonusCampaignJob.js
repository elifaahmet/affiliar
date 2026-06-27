"use strict";

const BonusCampaign = require("../models/BonusCampaign");
const { evaluateCampaign } = require("../controllers/affiliate/bonusCampaignController");
const { logger } = require("../middlewares/logger");

// Periodically grant bonus awards for affiliates who've crossed a campaign's
// target. Evaluates non-archived campaigns whose window is live or ended within
// a short grace period (so end-of-window crossings still get caught).
const REFRESH_MS = parseInt(process.env.BONUS_JOB_REFRESH_MS || "600000", 10); // 10m
const INITIAL_DELAY_MS = parseInt(process.env.BONUS_JOB_INITIAL_DELAY_MS || "30000", 10);
const GRACE_MS = 2 * 24 * 60 * 60 * 1000; // keep evaluating 2 days past end

let scheduledTimer = null;

async function runOnce() {
  const now = new Date();
  const campaigns = await BonusCampaign.find({
    status: "active",
    startDate: { $lte: now },
    endDate: { $gte: new Date(now.getTime() - GRACE_MS) },
  }).lean();

  let total = 0;
  for (const c of campaigns) {
    try {
      const created = await evaluateCampaign(c);
      total += created.length;
    } catch (err) {
      logger.error("bonus.job.campaign_failed", { campaignId: String(c._id), error: err?.message });
    }
  }
  if (campaigns.length) logger.info("bonus.job.ok", { campaigns: campaigns.length, newAwards: total });
  return { campaigns: campaigns.length, newAwards: total };
}

function startBonusCampaignJob() {
  if (scheduledTimer) return;
  setTimeout(() => {
    runOnce().catch((err) => logger.error("bonus.job.failed", { error: err?.message }));
    scheduledTimer = setInterval(() => {
      runOnce().catch((err) => logger.error("bonus.job.failed", { error: err?.message }));
    }, REFRESH_MS);
    scheduledTimer.unref?.();
  }, INITIAL_DELAY_MS);
  logger.info("bonus.job.started", { refreshMs: REFRESH_MS });
}

function stopBonusCampaignJob() {
  if (scheduledTimer) clearInterval(scheduledTimer);
  scheduledTimer = null;
}

module.exports = { startBonusCampaignJob, stopBonusCampaignJob, runOnce };
