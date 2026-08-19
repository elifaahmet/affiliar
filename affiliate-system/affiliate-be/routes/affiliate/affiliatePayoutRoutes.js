"use strict";

/**
 * Operator-side endpoints for paying affiliates via Coinflux
 * (USDT-TRC20). Mounted at /api/affiliate/payouts.
 *
 * Affiliate-side equivalents (set wallet, see own history) live on
 * /api/affiliate-portal under the existing portal router.
 */

const express = require("express");
const router  = express.Router();
const ctrl    = require("../../controllers/affiliate/affiliatePayoutController");
const requireOperatorOwner = require("../../middlewares/requireOperatorOwner");

// Owner-only section: payouts have no brand dimension, so brand-scoped
// operator users have no business here.
router.use(requireOperatorOwner);

// Settings (must come before /:id routes so it doesn't get matched as an id)
router.get ("/settings",                ctrl.getSettings);
router.put ("/settings",                ctrl.updateSettings);

// Pending payouts surface (what's owed right now)
router.get ("/pending",                 ctrl.listPending);

// Bulk create from Commission page ("Pay All for period")
router.post("/batch",                   ctrl.batchCreate);

// Payout CRUD
router.get ("/",                        ctrl.listPayouts);
router.post("/",                        ctrl.createPayout);
router.get ("/:id",                     ctrl.getPayout);
router.post("/:id/dispatch",            ctrl.dispatchPayout);
router.post("/:id/cancel",              ctrl.cancelPayout);
router.post("/:id/mark-paid",           ctrl.markPaid);

module.exports = router;
