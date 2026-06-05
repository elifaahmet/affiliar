"use strict";

const express  = require("express");
const router   = express.Router();

const apiKeyAuth        = require("../../middlewares/apiKeyAuth");
const ctrl              = require("../../controllers/affiliate/affiliatePortalController");
const reportCtrl        = require("../../controllers/affiliate/reportController");
const marketingCtrl     = require("../../controllers/affiliate/affiliateMarketingController");
const playerCtrl        = require("../../controllers/affiliate/affiliatePlayerController");

/**
 * Read-only Affiliate API — the affiliate's own systems pull the same data
 * they see in the portal, authenticated by a per-affiliate API key (NOT the
 * session JWT). Mounted before the global authorize() gate in index.js.
 *
 * Every handler is reused verbatim from the portal: apiKeyAuth sets
 * req.affiliateUser to the affiliate's User doc, exactly as the JWT path does,
 * so the controllers behave identically. All endpoints are GET (read-only).
 */
router.use(apiKeyAuth);

// Overview + campaign performance.
router.get("/overview",         ctrl.overview);
router.get("/campaign-reports", reportCtrl.portalCampaignReport);

// Players the affiliate brought (scoped to the affiliate's subtree).
router.get("/players",          playerCtrl.list);

// Commission + payouts.
router.get("/commission",       ctrl.commissionReports);
router.get("/payouts",          ctrl.listMyPayouts);
router.get("/payout-balance",   ctrl.getPayoutBalance);

// Referral codes + brand pages + saved links.
router.get("/referral-codes",   ctrl.referralCodes);
router.get("/brand-pages",      marketingCtrl.listBrandPages);
router.get("/links",            marketingCtrl.listLinks);

module.exports = router;
