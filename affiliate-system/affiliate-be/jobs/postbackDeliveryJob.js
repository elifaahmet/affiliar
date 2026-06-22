"use strict";

const axios = require("axios");
const PostbackDelivery = require("../models/PostbackDelivery");
const { buildPostbackUrl } = require("../utils/postback");
const { logger } = require("../middlewares/logger");

// Near-real-time: scan pending postbacks every 20s by default. Each scan
// delivers a batch; failures back off and retry on later scans until
// maxAttempts, then settle to `failed`.
const REFRESH_MS = parseInt(process.env.POSTBACK_JOB_REFRESH_MS || "20000", 10);
const INITIAL_DELAY_MS = parseInt(process.env.POSTBACK_JOB_INITIAL_DELAY_MS || "15000", 10);
const BATCH = parseInt(process.env.POSTBACK_JOB_BATCH || "50", 10);
const TIMEOUT_MS = parseInt(process.env.POSTBACK_JOB_TIMEOUT_MS || "10000", 10);

let scheduledTimer = null;

// Exponential backoff with a cap: 1m, 2m, 4m, 8m, 16m → max ~30m.
function backoffMs(attempts) {
  return Math.min(60_000 * 2 ** (attempts - 1), 30 * 60_000);
}

async function deliverOne(row) {
  const finalUrl = buildPostbackUrl(row.urlTemplate, row);
  try {
    const res = await axios.get(finalUrl, {
      timeout: TIMEOUT_MS,
      // A postback receiver returning 3xx/4xx is still "we reached them"; only
      // 2xx counts as delivered. Don't follow redirects or throw on status —
      // we inspect it ourselves.
      maxRedirects: 0,
      validateStatus: () => true,
    });
    const ok = res.status >= 200 && res.status < 300;
    if (ok) {
      row.status = "sent";
      row.sentAt = new Date();
      row.responseStatus = res.status;
      row.finalUrl = finalUrl;
      row.lastError = null;
      row.attempts += 1;
      await row.save();
      return true;
    }
    throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    row.attempts += 1;
    row.finalUrl = finalUrl;
    row.responseStatus = err?.response?.status ?? null;
    row.lastError = err?.message || String(err);
    if (row.attempts >= row.maxAttempts) {
      row.status = "failed";
    } else {
      row.nextAttemptAt = new Date(Date.now() + backoffMs(row.attempts));
    }
    await row.save();
    return false;
  }
}

async function runOnce({ now = new Date() } = {}) {
  const rows = await PostbackDelivery.find({
    status: "pending",
    nextAttemptAt: { $lte: now },
  })
    .sort({ nextAttemptAt: 1 })
    .limit(BATCH);

  if (rows.length === 0) return { scanned: 0, sent: 0, failed: 0 };

  const results = await Promise.allSettled(rows.map((r) => deliverOne(r)));
  const sent = results.filter((r) => r.status === "fulfilled" && r.value).length;
  logger.info("postback.delivery.job.ok", { scanned: rows.length, sent, retriedOrFailed: rows.length - sent });
  return { scanned: rows.length, sent, failed: rows.length - sent };
}

function startPostbackDeliveryJob() {
  if (scheduledTimer) return;
  setTimeout(() => {
    runOnce().catch((err) => logger.error("postback.delivery.job.failed", { error: err?.message }));
    scheduledTimer = setInterval(() => {
      runOnce().catch((err) => logger.error("postback.delivery.job.failed", { error: err?.message }));
    }, REFRESH_MS);
    scheduledTimer.unref?.();
  }, INITIAL_DELAY_MS);
  logger.info("postback.delivery.job.started", { refreshMs: REFRESH_MS });
}

function stopPostbackDeliveryJob() {
  if (scheduledTimer) clearInterval(scheduledTimer);
  scheduledTimer = null;
}

module.exports = { startPostbackDeliveryJob, stopPostbackDeliveryJob, runOnce };
