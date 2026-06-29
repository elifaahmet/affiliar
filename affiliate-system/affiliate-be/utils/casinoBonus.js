"use strict";

const axios = require("axios");
const { logger } = require("../middlewares/logger");

// ── Casino (pixup) bonus provisioning adapter ────────────────────────────────
// Creates a real bonus definition in the casino's bonus-management service so an
// affiliate's distributed code can actually be applied. Goes through the casino
// admin-backend bonus endpoint (which already validates + proxies to the Go
// BONUS_SERVICE). Env-gated: if not configured, callers should mark the code
// provision "pending" and let the operator re-sync once the casino side is wired.
//
//   CASINO_BONUS_API_URL    e.g. https://admin.<casino>/api/bonus-definitions/sync
//   CASINO_BONUS_API_TOKEN  service token the casino accepts from Affiliar
//
// Phase 2 (casino side) finalises the exact field names + auth; the mapping
// below follows the bonus-definition shape observed in the admin bonusController
// (type, code, wagering_multiplier, deposit/wager trigger details, etc.).

const API_URL = process.env.CASINO_BONUS_API_URL || "";
const API_TOKEN = process.env.CASINO_BONUS_API_TOKEN || "";
const TIMEOUT_MS = parseInt(process.env.CASINO_BONUS_TIMEOUT_MS || "12000", 10);

function isConfigured() {
  return !!(API_URL && API_TOKEN);
}

// Pull model: same env (CASINO_BONUS_API_URL points at the casino's
// /affiliar-bonus/definitions read endpoint, CASINO_BONUS_API_TOKEN is the
// shared service token). Everything is guarded on these being set.
function pullConfigured() {
  return !!(API_URL && API_TOKEN);
}

// Fetch the casino's active bonus definitions. Returns [] if not configured.
async function fetchDefinitions() {
  if (!pullConfigured()) return [];
  const res = await axios.get(API_URL, {
    timeout: TIMEOUT_MS,
    headers: { "x-affiliar-token": API_TOKEN },
  });
  const defs = res.data?.definitions || res.data || [];
  return Array.isArray(defs) ? defs : [];
}

// Map an offer + a specific affiliate sub-code to the casino bonus-definition
// payload.
function toDefinition(offer, code) {
  const base = {
    code,
    type: offer.type,
    currency: offer.currency,
    wagering_multiplier: offer.wageringMultiplier,
    validity_days: offer.validityDays,
    // attribution echoed back on redemption so the casino can report the claim
    affiliate_meta: { operatorId: String(offer.operatorId), offerId: String(offer._id) },
  };
  if (offer.type === "deposit_bonus") {
    base.deposit_trigger_details = {
      min_deposit_amount: offer.minDepositAmount ?? 0,
      percent_amount: offer.percentAmount ?? 0,
      max_bonus_amount: offer.maxBonusAmount ?? null,
      wagering_multiplier_for_activation: offer.wageringMultiplier,
    };
  } else if (offer.type === "free_spins") {
    base.free_spin_bonus_details = {
      count: offer.freeSpinCount ?? 0,
      game_id: offer.freeSpinGameId ?? null,
      spin_value: offer.freeSpinValue ?? null,
    };
  } else if (offer.type === "cashback") {
    base.cashback_bonus_details = {
      percent: offer.cashbackPercent ?? 0,
      max_amount: offer.cashbackMaxAmount ?? null,
    };
  }
  return base;
}

// Create the bonus definition for one affiliate code. Returns
// { externalBonusId } on success; throws on failure.
async function createBonusDefinition(offer, code) {
  if (!isConfigured()) {
    const e = new Error("casino bonus API not configured");
    e.code = "NOT_CONFIGURED";
    throw e;
  }
  const payload = toDefinition(offer, code);
  const res = await axios.post(API_URL, payload, {
    timeout: TIMEOUT_MS,
    headers: { Authorization: `Bearer ${API_TOKEN}`, "Content-Type": "application/json" },
  });
  const externalBonusId =
    res.data?.external_bonus_id || res.data?.id || res.data?.bonusId || res.data?.definitionId || null;
  logger.info("casinoBonus.created", { code, externalBonusId });
  return { externalBonusId };
}

module.exports = { isConfigured, pullConfigured, fetchDefinitions, toDefinition, createBonusDefinition };
