const express        = require("express");
const router         = express.Router();
const ctrl           = require("../../controllers/affiliate/affiliatePortalController");
const reportCtrl     = require("../../controllers/affiliate/reportController");
const { recalculateSubtreePayouts } = require("../../controllers/affiliate/commissionController");

router.get("/overview",            ctrl.overview);
router.get("/providers",           ctrl.providers);
router.get("/commission",          ctrl.commissionReports);
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

// Payout wallet + history (affiliate-owned, USDT-TRC20)
router.get ("/payout-info",        ctrl.getPayoutInfo);
router.put ("/payout-info",        ctrl.updatePayoutInfo);
router.get ("/payouts",            ctrl.listMyPayouts);

module.exports = router;
