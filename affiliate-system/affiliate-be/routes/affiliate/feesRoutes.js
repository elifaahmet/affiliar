const express = require("express");
const router = express.Router();
const feesController = require("../../controllers/affiliate/feesController");

router.get("/brands", feesController.listBrands);

router.get("/provider-rates", feesController.listProviderRates);
router.put("/provider-rates", feesController.upsertProviderRate);
router.delete("/provider-rates/:providerId", feesController.deleteProviderRate);

router.get("/settings", feesController.getFinancialSettings);
router.put("/settings", feesController.updateFinancialSettings);

router.post("/run", feesController.runNow);

module.exports = router;
