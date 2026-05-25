const express = require("express");
const router = express.Router();
const feesController = require("../../controllers/affiliate/feesController");
const { checkBulkImport } = require("../../middlewares/planGuard");

router.get("/brands", feesController.listBrands);

router.get("/provider-rates", feesController.listProviderRates);
router.put("/provider-rates", feesController.upsertProviderRate);
// Bulk CSV import is plan-gated; single upsert + delete stay open so
// operators can still hand-tune individual rates on cheaper plans.
router.post("/provider-rates/bulk", checkBulkImport, feesController.bulkUpsertProviderRates);
router.delete("/provider-rates/:providerId", feesController.deleteProviderRate);

router.get("/settings", feesController.getFinancialSettings);
router.put("/settings", feesController.updateFinancialSettings);

// Version history surface — UI shows operators what their fee config
// looked like at each effectiveFrom point, alongside the manual-run picker.
router.get("/settings/history",       feesController.listFinancialHistory);
router.get("/provider-rates/history", feesController.listProviderRateHistory);

router.post("/run", feesController.runNow);

module.exports = router;
