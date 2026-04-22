const express        = require("express");
const router         = express.Router();
const ctrl           = require("../../controllers/affiliate/affiliatePortalController");
const reportCtrl     = require("../../controllers/affiliate/reportController");

router.get("/overview",          ctrl.overview);
router.get("/providers",         ctrl.providers);
router.get("/commission",        ctrl.commissionReports);
router.get("/profile",           ctrl.getProfile);
router.patch("/profile",         ctrl.updateProfile);
router.get("/sub-affiliates",    ctrl.subAffiliates);
router.get("/campaign-reports",  reportCtrl.portalCampaignReport);

module.exports = router;
