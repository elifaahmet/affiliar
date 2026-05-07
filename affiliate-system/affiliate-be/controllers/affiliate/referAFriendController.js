"use strict";

/**
 * Operator-facing endpoints for the refer-a-friend dashboard:
 *   - per-brand config CRUD
 *   - signing-secret rotation
 *   - test event injection (builds a synthetic delivery; the worker
 *     dispatches it like any other)
 *   - activity table (referrals)
 *   - delivery audit + manual replay
 *
 * Mounted under /api/v1/refer/*. All endpoints are operator-scoped —
 * cross-operator access is blocked at every read and write.
 */

const crypto = require("crypto");

const Brand              = require("../../models/Brand");
const ReferAFriendConfig = require("../../models/ReferAFriendConfig");
const PlayerReferral     = require("../../models/PlayerReferral");
const RewardDelivery     = require("../../models/RewardDelivery");

// ── Auth helpers ──────────────────────────────────────────────────────────────

function operatorOnly(req, res) {
  const user = req.affiliateUser;
  if (!user || user.role !== "operator") {
    res.status(403).json({ error: "Operator authentication required" });
    return null;
  }
  if (!user.operatorId) {
    res.status(403).json({ error: "No operator linked to account" });
    return null;
  }
  return String(user.operatorId);
}

async function loadOwnedBrand(brandId, operatorId) {
  const brand = await Brand.findById(brandId).lean();
  if (!brand) return { ok: false, status: 404, error: "brand_not_found" };
  if (String(brand.operatorId) !== String(operatorId)) {
    return { ok: false, status: 403, error: "brand_not_owned_by_operator" };
  }
  return { ok: true, brand };
}

/**
 * Strip the literal signingSecret from any config doc before returning it
 * to the client. Once a secret is generated, the operator sees it exactly
 * once at rotation time; subsequent reads return only `secretPresent`.
 */
function redactConfig(config) {
  if (!config) return null;
  const obj = config.toObject ? config.toObject() : { ...config };
  if (obj.webhook) {
    const secretPresent = !!obj.webhook.signingSecret;
    delete obj.webhook.signingSecret;
    obj.webhook.secretPresent = secretPresent;
  }
  return obj;
}

// ── Config CRUD ───────────────────────────────────────────────────────────────

// GET /api/v1/refer/config — list all brand configs for this operator
exports.listConfigs = async (req, res) => {
  const operatorId = operatorOnly(req, res);
  if (!operatorId) return;

  const configs = await ReferAFriendConfig.find({ operatorId }).lean();
  // .lean() returns plain objects — manually redact secrets.
  const redacted = configs.map((c) => {
    const out = { ...c };
    if (out.webhook) {
      const secretPresent = !!out.webhook.signingSecret;
      delete out.webhook.signingSecret;
      out.webhook = { ...out.webhook, secretPresent };
    }
    return out;
  });
  return res.status(200).json({ configs: redacted });
};

// GET /api/v1/refer/config/:brandId
exports.getConfig = async (req, res) => {
  const operatorId = operatorOnly(req, res);
  if (!operatorId) return;

  const { brandId } = req.params;
  const ownership = await loadOwnedBrand(brandId, operatorId);
  if (!ownership.ok) return res.status(ownership.status).json({ error: ownership.error });

  const config = await ReferAFriendConfig.findOne({ brandId });
  if (!config) return res.status(200).json({ config: null });

  return res.status(200).json({ config: redactConfig(config) });
};

// PUT /api/v1/refer/config/:brandId — upsert
exports.upsertConfig = async (req, res) => {
  const operatorId = operatorOnly(req, res);
  if (!operatorId) return;

  const { brandId } = req.params;
  const ownership = await loadOwnedBrand(brandId, operatorId);
  if (!ownership.ok) return res.status(ownership.status).json({ error: ownership.error });

  const { enabled, reward, qualification, caps, webhook } = req.body || {};

  // Build update doc carefully — never let the request overwrite the
  // signingSecret directly. Secret rotation goes through its own endpoint.
  const update = {
    operatorId,
    ...(typeof enabled === "boolean" ? { enabled } : {}),
    ...(reward ? { reward } : {}),
    ...(qualification ? { qualification } : {}),
    ...(caps ? { caps } : {}),
    ...(webhook
      ? {
          // Allow url + enabled toggle; signingSecret is read-only here.
          "webhook.url": webhook.url ?? null,
          "webhook.enabled": typeof webhook.enabled === "boolean" ? webhook.enabled : false,
        }
      : {}),
  };

  const config = await ReferAFriendConfig.findOneAndUpdate(
    { brandId },
    { $set: update, $setOnInsert: { brandId } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  return res.status(200).json({ config: redactConfig(config) });
};

// POST /api/v1/refer/config/:brandId/secret/rotate
//   Returns the new signingSecret in the response body — exactly once.
//   The operator must save it; subsequent reads will not include it.
exports.rotateSecret = async (req, res) => {
  const operatorId = operatorOnly(req, res);
  if (!operatorId) return;

  const { brandId } = req.params;
  const ownership = await loadOwnedBrand(brandId, operatorId);
  if (!ownership.ok) return res.status(ownership.status).json({ error: ownership.error });

  const newSecret = crypto.randomBytes(32).toString("hex");

  await ReferAFriendConfig.findOneAndUpdate(
    { brandId },
    {
      $set: {
        operatorId,
        "webhook.signingSecret": newSecret,
        "webhook.secretRotatedAt": new Date(),
      },
      $setOnInsert: { brandId },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  return res.status(200).json({
    signingSecret: newSecret,
    secretRotatedAt: new Date(),
    notice: "Save this secret now. It will not be shown again.",
  });
};

// POST /api/v1/refer/config/:brandId/test-event?type=referral.reward.issued
//   Enqueues a synthetic delivery with referralId="test_referral_id". The
//   worker (Step 4) will dispatch it the same as any production delivery.
exports.sendTestEvent = async (req, res) => {
  const operatorId = operatorOnly(req, res);
  if (!operatorId) return;

  const { brandId } = req.params;
  const ownership = await loadOwnedBrand(brandId, operatorId);
  if (!ownership.ok) return res.status(ownership.status).json({ error: ownership.error });

  const eventType = req.query.type === "referral.reward.reversed"
    ? "referral.reward.reversed"
    : "referral.reward.issued";

  const config = await ReferAFriendConfig.findOne({ brandId });
  if (!config || !config.webhook || !config.webhook.url) {
    return res.status(400).json({ error: "webhook_url_not_configured" });
  }
  if (!config.webhook.signingSecret) {
    return res.status(400).json({ error: "signing_secret_not_set" });
  }

  const now = new Date();
  const baseData = {
    brandId: String(brandId),
    referralId: "test_referral_id",
    referrerPlayerId: "test_referrer",
    refereePlayerId: "test_referee",
    rewardCents: 500,
    rewardCurrency: (config.reward && config.reward.currency) || "EUR",
    rewardKind: (config.reward && config.reward.rewardKind) || "bonus",
    qualifiedAt: now.toISOString(),
    ftdCents: 5000,
    ftdCurrency: "EUR",
  };

  const data =
    eventType === "referral.reward.reversed"
      ? {
          ...baseData,
          originalDeliveryId: "test_original_delivery",
          reversedAt: now.toISOString(),
          reversalReason: "test_chargeback",
          reversedAmountCents: 5000,
        }
      : baseData;

  const payload = {
    id: `evt_test_${crypto.randomBytes(8).toString("hex")}`,
    type: eventType,
    createdAt: now.toISOString(),
    data,
  };

  const delivery = await RewardDelivery.create({
    referralId: null,
    brandId,
    operatorId,
    eventType,
    payload,
    payloadHash: crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
    status: "pending",
    nextAttemptAt: now,
  });

  return res.status(202).json({
    deliveryId: String(delivery._id),
    status: "pending",
    notice: "Test event queued. The delivery worker will dispatch it shortly.",
  });
};

// ── Activity ──────────────────────────────────────────────────────────────────

// GET /api/v1/refer/referrals?brandId=&status=&limit=&before=
exports.listReferrals = async (req, res) => {
  const operatorId = operatorOnly(req, res);
  if (!operatorId) return;

  const { brandId, status, limit, before } = req.query || {};
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);

  const match = { operatorId };
  if (brandId) {
    const ownership = await loadOwnedBrand(brandId, operatorId);
    if (!ownership.ok) return res.status(ownership.status).json({ error: ownership.error });
    match.brandId = brandId;
  }
  if (status) match.status = status;
  if (before) match.createdAt = { $lt: new Date(before) };

  const referrals = await PlayerReferral.find(match)
    .sort({ createdAt: -1 })
    .limit(lim)
    .lean();

  return res.status(200).json({ referrals, count: referrals.length });
};

// GET /api/v1/refer/referrals/:id
exports.getReferral = async (req, res) => {
  const operatorId = operatorOnly(req, res);
  if (!operatorId) return;

  const referral = await PlayerReferral.findById(req.params.id).lean();
  if (!referral || String(referral.operatorId) !== operatorId) {
    return res.status(404).json({ error: "referral_not_found" });
  }

  const deliveries = await RewardDelivery.find({ referralId: referral._id })
    .sort({ createdAt: -1 })
    .lean();

  return res.status(200).json({ referral, deliveries });
};

// ── Deliveries ────────────────────────────────────────────────────────────────

// GET /api/v1/refer/deliveries?brandId=&status=&limit=&before=
exports.listDeliveries = async (req, res) => {
  const operatorId = operatorOnly(req, res);
  if (!operatorId) return;

  const { brandId, status, eventType, limit, before } = req.query || {};
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);

  const match = { operatorId };
  if (brandId) {
    const ownership = await loadOwnedBrand(brandId, operatorId);
    if (!ownership.ok) return res.status(ownership.status).json({ error: ownership.error });
    match.brandId = brandId;
  }
  if (status) match.status = status;
  if (eventType) match.eventType = eventType;
  if (before) match.createdAt = { $lt: new Date(before) };

  const deliveries = await RewardDelivery.find(match)
    .sort({ createdAt: -1 })
    .limit(lim)
    .lean();

  return res.status(200).json({ deliveries, count: deliveries.length });
};

// POST /api/v1/refer/deliveries/:id/replay
//   Creates a new delivery row pointing at the original via replayOf.
//   The original row stays as a historical record; the new row is what
//   the worker picks up.
exports.replayDelivery = async (req, res) => {
  const operatorId = operatorOnly(req, res);
  if (!operatorId) return;

  const original = await RewardDelivery.findById(req.params.id);
  if (!original || String(original.operatorId) !== operatorId) {
    return res.status(404).json({ error: "delivery_not_found" });
  }

  if (original.status === "pending") {
    return res.status(409).json({ error: "delivery_still_pending" });
  }

  const replay = await RewardDelivery.create({
    referralId: original.referralId,
    brandId: original.brandId,
    operatorId: original.operatorId,
    eventType: original.eventType,
    payload: original.payload,
    payloadHash: original.payloadHash,
    status: "pending",
    nextAttemptAt: new Date(),
    replayOf: original._id,
  });

  return res.status(201).json({
    deliveryId: String(replay._id),
    status: replay.status,
    replayOf: String(original._id),
  });
};
