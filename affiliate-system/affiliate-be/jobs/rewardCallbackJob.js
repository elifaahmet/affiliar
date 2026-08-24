// Pushes Refer-a-Friend reward events to each brand's configured webhook.
//
// This runs alongside — not instead of — the pull model. A brand with no
// webhook (or `enabled: false`) is simply never selected here, and its
// RewardDelivery rows keep waiting for GET /refer/deliveries as before.
// Whichever path lands first flips the row to `delivered` and runs the same
// cascade (engine.applyDeliveryAck), so an operator who both polls and
// receives pushes still credits each player exactly once.

const axios = require("axios");
const crypto = require("crypto");
const RewardDelivery = require("../models/RewardDelivery");
const ReferAFriendConfig = require("../models/ReferAFriendConfig");
const { applyDeliveryAck } = require("../engine/referralEngine");
const { buildSignature } = require("../utils/webhookSignature");
const { logger } = require("../middlewares/logger");

// WEBHOOK.md §5. Index = attempts already made, value = wait before the next
// try. Length also sets the cap: once attempts reaches MAX_ATTEMPTS the row is
// marked `failed` rather than rescheduled.
const BACKOFF_MS = [
  60 * 1000,        // → attempt 2, 1m
  5 * 60 * 1000,    // → attempt 3, 5m
  30 * 60 * 1000,   // → attempt 4, 30m
  2 * 60 * 60 * 1000,  // → attempt 5, 2h
  12 * 60 * 60 * 1000, // → attempt 6, 12h
  24 * 60 * 60 * 1000, // → final, 24h
];
const MAX_ATTEMPTS = BACKOFF_MS.length + 1; // 7 total incl. the immediate one
const REQUEST_TIMEOUT_MS = 10_000;
const BATCH_SIZE = 50;
const TICK_MS = 60 * 1000;

/** Record one attempt's outcome on the delivery row. */
function noteAttempt(delivery, outcome) {
  const at = new Date();
  const entry = { attemptedAt: at, latencyMs: outcome.latencyMs ?? null,
    statusCode: outcome.statusCode ?? null, bodySnippet: outcome.bodySnippet ?? null,
    errorMessage: outcome.errorMessage ?? null };
  delivery.attempts += 1;
  delivery.lastAttemptAt = at;
  delivery.lastResponse = entry;
  delivery.attemptHistory.push(entry);
}

async function deliverOne(delivery, config) {
  // Frozen at enqueue time so retries re-send byte-identical bodies — the
  // signature covers these exact bytes, so re-serializing could break a
  // receiver that verifies before parsing.
  const rawBody = JSON.stringify(delivery.payload);
  const timestampSec = Math.floor(Date.now() / 1000);
  const started = Date.now();

  try {
    const res = await axios.post(config.webhook.url, rawBody, {
      timeout: REQUEST_TIMEOUT_MS,
      // Send the string we signed, not the object — axios would otherwise
      // re-serialize and could differ in key order or whitespace.
      transformRequest: [(d) => d],
      headers: {
        "Content-Type": "application/json",
        "X-Affiliar-Event": delivery.eventType,
        "X-Affiliar-Delivery": crypto.randomUUID(),
        "X-Affiliar-Timestamp": String(timestampSec),
        "X-Affiliar-Signature": buildSignature(rawBody, config.webhook.secrets, timestampSec),
      },
      // Treat every status as a resolution so non-2xx lands in our retry
      // bookkeeping instead of the catch block's network-error path.
      validateStatus: () => true,
    });

    const latencyMs = Date.now() - started;
    const bodySnippet = typeof res.data === "string"
      ? res.data.slice(0, 256)
      : JSON.stringify(res.data ?? "").slice(0, 256);

    noteAttempt(delivery, { statusCode: res.status, bodySnippet, latencyMs });
    return res.status >= 200 && res.status < 300;
  } catch (err) {
    noteAttempt(delivery, {
      errorMessage: err?.message?.slice(0, 256) || "request failed",
      latencyMs: Date.now() - started,
    });
    return false;
  }
}

async function processDue() {
  const now = new Date();

  // Only brands that opted in. Doing this first means a pull-only operator's
  // rows are never even loaded, let alone touched.
  const configs = await ReferAFriendConfig.find({
    "webhook.enabled": true,
    "webhook.url": { $ne: "" },
  }).select("brandId webhook");
  if (!configs.length) return;

  const byBrand = new Map(configs.map((c) => [String(c.brandId), c]));

  const due = await RewardDelivery.find({
    status: "pending",
    brandId: { $in: configs.map((c) => c.brandId) },
    nextAttemptAt: { $lte: now },
  }).limit(BATCH_SIZE);

  for (const delivery of due) {
    const config = byBrand.get(String(delivery.brandId));
    if (!config) continue;

    const ok = await deliverOne(delivery, config);

    if (ok) {
      delivery.status = "delivered";
      delivery.deliveredAt = new Date();
      await delivery.save();
      // Same cascade the pull-model claim endpoint runs, and idempotent, so a
      // race with a concurrent claim settles harmlessly.
      await applyDeliveryAck(delivery);
      logger.info("reward.callback.delivered", {
        deliveryId: String(delivery._id), eventType: delivery.eventType,
        attempts: delivery.attempts,
      });
      continue;
    }

    if (delivery.attempts >= MAX_ATTEMPTS) {
      delivery.status = "failed";
      await delivery.save();
      logger.warn("reward.callback.exhausted", {
        deliveryId: String(delivery._id), eventType: delivery.eventType,
        lastStatus: delivery.lastResponse?.statusCode ?? null,
      });
      continue;
    }

    // attempts is 1-based after noteAttempt; BACKOFF_MS is 0-based on
    // "attempts already made", so index attempts-1 gives the next wait.
    const waitMs = BACKOFF_MS[delivery.attempts - 1] ?? BACKOFF_MS[BACKOFF_MS.length - 1];
    delivery.nextAttemptAt = new Date(Date.now() + waitMs);
    await delivery.save();
  }
}

function startRewardCallbackJob() {
  const tick = async () => {
    try {
      await processDue();
    } catch (err) {
      logger.error("reward.callback.tick.failed", { error: err?.message });
    }
  };
  tick();
  setInterval(tick, TICK_MS);
}

module.exports = { startRewardCallbackJob, processDue, deliverOne, BACKOFF_MS, MAX_ATTEMPTS };
