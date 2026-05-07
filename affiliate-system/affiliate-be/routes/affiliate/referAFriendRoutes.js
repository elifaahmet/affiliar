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

// ── Integration: operator → affiliar event reports ───────────────────────────

router.post("/track-signup",        integration.trackSignup);
router.post("/track-ftd",           integration.trackFtd);
router.post("/track-ftd-reversal",  integration.trackFtdReversal);
router.get ("/stats",               integration.getStats);

// ── Operator: per-brand config CRUD ──────────────────────────────────────────

router.get ("/config",                              operatorCtl.listConfigs);
router.get ("/config/:brandId",                     operatorCtl.getConfig);
router.put ("/config/:brandId",                     operatorCtl.upsertConfig);
router.post("/config/:brandId/secret/rotate",       operatorCtl.rotateSecret);
router.post("/config/:brandId/test-event",          operatorCtl.sendTestEvent);

// ── Operator: activity (referrals + deliveries) ──────────────────────────────

router.get ("/referrals",                operatorCtl.listReferrals);
router.get ("/referrals/:id",            operatorCtl.getReferral);
router.get ("/deliveries",               operatorCtl.listDeliveries);
router.post("/deliveries/:id/replay",    operatorCtl.replayDelivery);

module.exports = router;
