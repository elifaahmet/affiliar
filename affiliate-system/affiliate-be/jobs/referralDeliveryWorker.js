"use strict";

/**
 * Outbound webhook dispatcher for refer-a-friend reward events.
 *
 * Polls RewardDelivery rows where status='pending' and nextAttemptAt has
 * elapsed, signs them with the brand's HMAC secret, POSTs to the brand's
 * webhook URL, parses the response, and either marks the row delivered
 * (2xx), schedules the next retry (408/429/5xx/timeout), or marks it
 * failed terminal (other 4xx, or retries exhausted).
 *
 * Retry schedule per docs/refer-a-friend/WEBHOOK.md §5:
 *   attempt 1  → immediate (created with nextAttemptAt = now)
 *   attempt 2  → 1m   after  attempt 1 failure
 *   attempt 3  → 5m   after  attempt 2 failure
 *   attempt 4  → 30m  after  attempt 3 failure
 *   attempt 5  → 2h   after  attempt 4 failure
 *   attempt 6  → 12h  after  attempt 5 failure
 *   exhausted  → terminal 'failed' after 6th failure
 *
 * On a 'delivered' issued event, the worker also transitions the
 * underlying PlayerReferral from 'qualified' → 'rewarded'. Reversed
 * events do not transition the referral (already moved to 'reversed'
 * by the engine when the delivery was enqueued).
 *
 * Concurrency: single worker, sequential dispatch per tick. Phase 1
 * volume doesn't justify parallelism; the compound (status, nextAttemptAt)
 * index keeps polling cheap.
 */

const crypto = require("crypto");
const https  = require("https");
const http   = require("http");
const { URL } = require("url");

const RewardDelivery     = require("../models/RewardDelivery");
const PlayerReferral     = require("../models/PlayerReferral");
const ReferAFriendConfig = require("../models/ReferAFriendConfig");
const { logger }         = require("../middlewares/logger");

const POLL_INTERVAL_MS = parseInt(process.env.REFERRAL_WORKER_POLL_MS || "10000", 10);
const BATCH_SIZE       = parseInt(process.env.REFERRAL_WORKER_BATCH || "50", 10);
const REQUEST_TIMEOUT_MS = parseInt(process.env.REFERRAL_WORKER_TIMEOUT_MS || "10000", 10);

const MAX_ATTEMPTS = 6;
// Delay before attempt N+1, given attempt N just failed.
// Index 0 is unused; index 1 = "after 1st failure, wait this long".
const RETRY_DELAYS_MS = [
  null,
  1   * 60 * 1000,         // 1m
  5   * 60 * 1000,         // 5m
  30  * 60 * 1000,         // 30m
  2   * 60 * 60 * 1000,    // 2h
  12  * 60 * 60 * 1000,    // 12h
];

// HTTP statuses we retry on. Anything else 4xx is terminal.
const RETRIABLE_STATUSES = new Set([408, 425, 429]);

// ── Public ────────────────────────────────────────────────────────────────────

let runningTimer = null;

function startReferralDeliveryWorker() {
  if (runningTimer) return; // idempotent
  runningTimer = setInterval(() => {
    runOnce().catch((err) =>
      logger.error("referral.worker.tick_failed", { error: err?.message || String(err) }),
    );
  }, POLL_INTERVAL_MS);
  runningTimer.unref?.();
  logger.info("referral.worker.started", { pollMs: POLL_INTERVAL_MS, batch: BATCH_SIZE });
}

function stopReferralDeliveryWorker() {
  if (runningTimer) {
    clearInterval(runningTimer);
    runningTimer = null;
  }
}

/**
 * One worker tick. Exposed for tests + the index.js boot path that runs
 * an immediate first pass.
 */
async function runOnce() {
  const now = new Date();
  const due = await RewardDelivery.find({
    status: "pending",
    nextAttemptAt: { $lte: now },
  })
    .sort({ nextAttemptAt: 1 })
    .limit(BATCH_SIZE);

  for (const delivery of due) {
    try {
      await dispatch(delivery);
    } catch (err) {
      logger.error("referral.worker.dispatch_failed", {
        deliveryId: String(delivery._id),
        error: err?.message || String(err),
      });
    }
  }
}

// ── Per-delivery dispatch ─────────────────────────────────────────────────────

async function dispatch(delivery) {
  const config = await ReferAFriendConfig.findOne({ brandId: delivery.brandId });

  // Operator paused the webhook (or never configured it). Leave the row
  // pending — the worker will skip it next tick. Operator un-pause re-
  // enables flow without losing events.
  if (!config || !config.webhook || !config.webhook.enabled || !config.webhook.url || !config.webhook.signingSecret) {
    logger.debug("referral.worker.skipped_disabled", { deliveryId: String(delivery._id) });
    return;
  }

  const attemptIndex = (delivery.attempts || 0) + 1; // this attempt's number
  const startedAt = Date.now();

  let outcome;
  try {
    const result = await postSigned({
      url: delivery.webhook && delivery.webhook.url ? delivery.webhook.url : config.webhook.url,
      secret: config.webhook.signingSecret,
      eventType: delivery.eventType,
      deliveryId: String(delivery._id),
      payload: delivery.payload,
    });
    outcome = result;
  } catch (err) {
    outcome = {
      statusCode: null,
      bodySnippet: null,
      latencyMs: Date.now() - startedAt,
      errorMessage: err?.message || String(err),
    };
  }

  outcome.latencyMs = outcome.latencyMs ?? Date.now() - startedAt;
  const attemptedAt = new Date();

  const attemptRecord = {
    attemptedAt,
    statusCode: outcome.statusCode,
    bodySnippet: outcome.bodySnippet,
    latencyMs: outcome.latencyMs,
    errorMessage: outcome.errorMessage,
  };

  // Bookkeeping that always happens.
  delivery.attempts = attemptIndex;
  delivery.lastAttemptAt = attemptedAt;
  delivery.lastResponse = attemptRecord;
  delivery.attemptHistory.push(attemptRecord);
  // Cap history at MAX_ATTEMPTS so docs don't grow unbounded.
  if (delivery.attemptHistory.length > MAX_ATTEMPTS) {
    delivery.attemptHistory = delivery.attemptHistory.slice(-MAX_ATTEMPTS);
  }

  // 2xx — delivered.
  if (outcome.statusCode && outcome.statusCode >= 200 && outcome.statusCode < 300) {
    delivery.status = "delivered";
    delivery.deliveredAt = attemptedAt;
    await delivery.save();
    await maybeMarkRewarded(delivery);
    logger.info("referral.worker.delivered", {
      deliveryId: String(delivery._id),
      eventType: delivery.eventType,
      attempts: attemptIndex,
      latencyMs: outcome.latencyMs,
    });
    return;
  }

  // Non-retriable 4xx — terminal failure.
  if (
    outcome.statusCode &&
    outcome.statusCode >= 400 &&
    outcome.statusCode < 500 &&
    !RETRIABLE_STATUSES.has(outcome.statusCode)
  ) {
    delivery.status = "failed";
    await delivery.save();
    logger.warn("referral.worker.failed_4xx", {
      deliveryId: String(delivery._id),
      statusCode: outcome.statusCode,
      bodySnippet: outcome.bodySnippet,
    });
    return;
  }

  // Retriable: 408 / 425 / 429 / 5xx / network/timeout.
  if (attemptIndex >= MAX_ATTEMPTS) {
    delivery.status = "failed";
    await delivery.save();
    logger.warn("referral.worker.exhausted", {
      deliveryId: String(delivery._id),
      attempts: attemptIndex,
      lastStatus: outcome.statusCode,
      lastError: outcome.errorMessage,
    });
    return;
  }

  const delayMs = RETRY_DELAYS_MS[attemptIndex];
  delivery.nextAttemptAt = new Date(Date.now() + delayMs);
  await delivery.save();
  logger.info("referral.worker.scheduled_retry", {
    deliveryId: String(delivery._id),
    attempts: attemptIndex,
    nextAttemptAt: delivery.nextAttemptAt,
    statusCode: outcome.statusCode,
  });
}

// ── Referral status transitions on delivery ───────────────────────────────────

async function maybeMarkRewarded(delivery) {
  if (!delivery.referralId) return; // test events have no referral

  const referral = await PlayerReferral.findById(delivery.referralId);
  if (!referral) return;

  // Referrer side drives the main referral.status. After the referrer
  // payout is acked, the referral is officially "rewarded" — the
  // referee side settles independently via refereeRewardedAt.
  if (delivery.eventType === "referral.reward.issued") {
    if (referral.status === "qualified") {
      referral.status = "rewarded";
      referral.rewardedAt = new Date();
      await referral.save();
    }
    return;
  }

  // Referee bonus delivery acked. Stamp refereeRewardedAt so the
  // dashboard / activity table can show "friend's bonus delivered".
  // Does not move referral.status (referrer path owns that).
  if (delivery.eventType === "referral.reward.referee.issued") {
    if (!referral.refereeRewardedAt) {
      referral.refereeRewardedAt = new Date();
      await referral.save();
    }
    return;
  }

  // Reversed events: no referral mutation here. The engine has already
  // moved status to 'reversed' before the delivery was queued.
}

// ── Signing + HTTP ────────────────────────────────────────────────────────────

/**
 * Build the signature header per docs/refer-a-friend/WEBHOOK.md §3.
 * Format: t=<unixSeconds>,v1=<hex hmac of "<t>.<rawBody>">
 */
function signPayload({ secret, rawBody, timestampSeconds }) {
  const signedPayload = `${timestampSeconds}.${rawBody}`;
  const v1 = crypto.createHmac("sha256", secret).update(signedPayload).digest("hex");
  return `t=${timestampSeconds},v1=${v1}`;
}

/**
 * Promise-wrapped HTTP(S) POST that returns the same shape the dispatcher
 * expects: { statusCode, bodySnippet, latencyMs, errorMessage }. Limits
 * the response read to 4KB to protect the worker from a misbehaving
 * endpoint replying with a multi-megabyte body.
 */
function postSigned({ url, secret, eventType, deliveryId, payload }) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (e) {
      return reject(new Error(`invalid_webhook_url: ${e.message}`));
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return reject(new Error(`unsupported_protocol: ${parsed.protocol}`));
    }

    const rawBody = JSON.stringify(payload);
    const timestampSeconds = Math.floor(Date.now() / 1000);
    const signature = signPayload({ secret, rawBody, timestampSeconds });

    const lib = parsed.protocol === "https:" ? https : http;
    const startedAt = Date.now();

    const req = lib.request(
      {
        method: "POST",
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
        path: parsed.pathname + parsed.search,
        timeout: REQUEST_TIMEOUT_MS,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(rawBody),
          "User-Agent": "Affiliar-Webhooks/1.0",
          "X-Affiliar-Event": eventType,
          "X-Affiliar-Delivery": deliveryId,
          "X-Affiliar-Timestamp": String(timestampSeconds),
          "X-Affiliar-Signature": signature,
        },
      },
      (res) => {
        const chunks = [];
        let total = 0;
        res.on("data", (c) => {
          if (total < 4096) {
            const remaining = 4096 - total;
            chunks.push(c.slice(0, remaining));
            total += Math.min(c.length, remaining);
          }
        });
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          resolve({
            statusCode: res.statusCode,
            bodySnippet: body.slice(0, 256),
            latencyMs: Date.now() - startedAt,
            errorMessage: null,
          });
        });
      },
    );

    req.on("timeout", () => {
      req.destroy(new Error("request_timeout"));
    });
    req.on("error", (err) => {
      resolve({
        statusCode: null,
        bodySnippet: null,
        latencyMs: Date.now() - startedAt,
        errorMessage: err.message,
      });
    });

    req.write(rawBody);
    req.end();
  });
}

module.exports = {
  startReferralDeliveryWorker,
  stopReferralDeliveryWorker,
  runOnce,
  // exported for tests
  _internals: { signPayload, RETRY_DELAYS_MS, MAX_ATTEMPTS },
};
