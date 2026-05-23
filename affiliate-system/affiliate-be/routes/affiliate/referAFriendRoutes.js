"use strict";

/**
 * Refer-a-Friend HTTP surface. Single router that bundles both:
 *   - Integration endpoints (operator's casino backend → affiliar)
 *   - Operator dashboard endpoints (affiliar UI → affiliar)
 *
 * Both use the same JWT auth middleware mounted globally in index.js,
 * and both require `role === 'operator'` (enforced in each controller).
 *
 * Mounted at /api/v1/refer in index.js — see the one-line addition there.
 */

const express = require("express");
const router  = express.Router();

const integration = require("../../controllers/integration/referAFriendIntegrationController");
const operatorCtl = require("../../controllers/affiliate/referAFriendController");
const { checkReferAFriend } = require("../../middlewares/planGuard");

// Refer-a-Friend is a plan-gated feature — the whole router needs it.
// Mounted at /api/refer in index.js, so the gate runs before any handler.
router.use(checkReferAFriend);

// ── Integration: operator → affiliar event reports ───────────────────────────

router.post("/track-signup",        integration.trackSignup);
router.post("/track-ftd",           integration.trackFtd);
router.post("/track-ftd-reversal",  integration.trackFtdReversal);
router.get ("/stats",               integration.getStats);

// Pull-model reward ledger (replaces the old webhook push)
router.get ("/player/:playerId/referrals",      integration.listPlayerReferrals);
router.get ("/player/:playerId/rewards",        integration.listPlayerRewards);
router.post("/player/:playerId/rewards/claim",  integration.claimPlayerRewards);

// ── Operator: per-brand config CRUD ──────────────────────────────────────────

router.get ("/config",                              operatorCtl.listConfigs);
router.get ("/config/:brandId",                     operatorCtl.getConfig);
router.put ("/config/:brandId",                     operatorCtl.upsertConfig);

// ── Operator: activity (referrals + deliveries / ledger) ─────────────────────

router.get ("/referrals",                operatorCtl.listReferrals);
router.get ("/referrals/:id",            operatorCtl.getReferral);
router.get ("/deliveries",               operatorCtl.listDeliveries);

module.exports = router;
