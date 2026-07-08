const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/affiliate/reportController");
const { checkCampaignTracking, checkAdvancedReports } = require("../../middlewares/planGuard");

router.get("/overview",    ctrl.overview);
router.get("/affiliates",  ctrl.affiliates);
router.get("/traffic",     ctrl.traffic);
router.get("/campaigns",   checkCampaignTracking, ctrl.campaignReport);
router.get("/clicks",      ctrl.clicksAnalytics);
// Advanced analytics (heavier ClickHouse) — Plus+.
router.get("/affiliate-quality", checkAdvancedReports, ctrl.affiliateQuality);
router.get("/cohorts",           checkAdvancedReports, ctrl.cohorts);

module.exports = router;
