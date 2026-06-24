const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/affiliate/reportController");
const { checkCampaignTracking } = require("../../middlewares/planGuard");

router.get("/overview",    ctrl.overview);
router.get("/affiliates",  ctrl.affiliates);
router.get("/traffic",     ctrl.traffic);
router.get("/campaigns",   checkCampaignTracking, ctrl.campaignReport);
router.get("/clicks",      ctrl.clicksAnalytics);

module.exports = router;
