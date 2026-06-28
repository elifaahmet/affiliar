const express        = require("express");
const router         = express.Router();
const ctrl           = require("../../controllers/affiliate/affiliatePortalController");
const reportCtrl     = require("../../controllers/affiliate/reportController");
const marketingCtrl  = require("../../controllers/affiliate/affiliateMarketingController");
const creativeCtrl   = require("../../controllers/affiliate/creativeController");
const { recalculateSubtreePayouts } = require("../../controllers/affiliate/commissionController");

router.get("/overview",            ctrl.overview);
router.get("/providers",           ctrl.providers);
router.get("/commission",          ctrl.commissionReports);
router.get("/statement",           ctrl.statement);
router.get("/profile",             ctrl.getProfile);
router.patch("/profile",           ctrl.updateProfile);
router.get("/sub-affiliates",      ctrl.subAffiliates);
router.patch("/sub-affiliates/:subId/sub-plan",   ctrl.updateSubPlan);
router.get("/sub-payouts",         ctrl.listSubPayouts);
router.post("/sub-payouts/calculate",             recalculateSubtreePayouts);
router.post("/sub-payouts/:payoutId/mark-paid",   ctrl.markSubPayoutPaid);
router.post("/sub-payouts/:payoutId/dispatch",    ctrl.dispatchSubPayout);
router.post("/sub-payouts/:payoutId/cancel",      ctrl.cancelSubPayout);
router.get ("/payout-balance",                    ctrl.getPayoutBalance);
router.get("/campaign-reports",    reportCtrl.portalCampaignReport);
router.post("/referral-codes",     ctrl.generateReferralCode);
router.get ("/fee-details",        ctrl.feeDetails);

// Marketing tools: operator-defined brand pages + the affiliate's saved links.
router.get   ("/creatives",        creativeCtrl.affiliateList);
router.get   ("/bonus-offers",     require("../../controllers/affiliate/bonusOfferController").affiliateList);
router.get   ("/brand-pages",      marketingCtrl.listBrandPages);
router.get   ("/links",            marketingCtrl.listLinks);
router.post  ("/links",            marketingCtrl.createLink);
router.delete("/links/:linkId",    marketingCtrl.deleteLink);

// API key for the affiliate's own systems (read-only pull API).
router.get ("/api-key",            ctrl.getApiKey);
router.post("/api-key/rotate",     ctrl.rotateApiKey);

// Real-time outbound postback (push conversions to the affiliate's own tracker).
router.get  ("/postback",            ctrl.getPostbackConfig);
router.patch("/postback",            ctrl.updatePostbackConfig);
router.get  ("/postback/deliveries", ctrl.listPostbackDeliveries);

// Affiliate maps a player to their own internal id (sub_id reconciliation).
router.patch("/players/:playerId/ref", ctrl.setPlayerRef);

// Payout wallet + history (affiliate-owned, USDT-TRC20)
router.get ("/payout-info",        ctrl.getPayoutInfo);
router.put ("/payout-info",        ctrl.updatePayoutInfo);
router.get ("/payouts",            ctrl.listMyPayouts);

module.exports = router;
