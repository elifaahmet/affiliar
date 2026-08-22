const express = require("express");
const router  = express.Router();
const ctrl    = require("../controllers/platformAdminController");
const requirePlatformAdmin = require("../middlewares/requirePlatformAdmin");

router.use(requirePlatformAdmin);

// Operators list + create
// Self-service applications awaiting review. Approval is what issues
// credentials and starts the trial, so it sits behind the platform-admin gate
// the rest of this router uses.
router.get("/applications",              ctrl.listApplications);
router.post("/applications/:id/approve", ctrl.approveApplication);
router.post("/applications/:id/reject",  ctrl.rejectApplication);

router.get("/operators",  ctrl.listOperators);
router.post("/operators", ctrl.createOperator);

// Cross-operator brand directory — comes before /operators/:id so it
// doesn't get shadowed by the param route.
router.get("/brands", ctrl.listAllBrands);

// Cross-operator reports rollup (admin-only)
router.get("/reports/overview", ctrl.adminReportsOverview);

// Cross-operator affiliates + payouts directories
router.get("/affiliates", ctrl.adminListAffiliates);
router.get("/payouts",    ctrl.adminListPayouts);

// Platform billing health — operators paying us
router.get("/billing",    ctrl.adminListPlatformBilling);

// Single-operator detail + update
router.get("/operators/:id",   ctrl.getOperator);
router.patch("/operators/:id", ctrl.updateOperator);

// Brand sub-endpoints (scoped to one operator)
router.get("/operators/:id/brands",            ctrl.listOperatorBrands);
router.post("/operators/:id/brands",           ctrl.createOperatorBrand);
router.patch("/operators/:id/brands/:brandId", ctrl.updateOperatorBrand);

// User sub-endpoints (operator-role users only — owner + later additions)
router.get("/operators/:id/users",  ctrl.listOperatorUsers);
router.post("/operators/:id/users", ctrl.createOperatorUser);
router.delete("/operators/:id/users/:userId",         ctrl.removeOperatorUser);
router.post("/operators/:id/users/:userId/restore",   ctrl.restoreOperatorUser);

// Read-only mirrors of what the operator sees on their own panel
router.get("/operators/:id/affiliates",        ctrl.listOperatorAffiliates);
router.get("/operators/:id/billing",           ctrl.getOperatorBilling);
router.get("/operators/:id/commission-plans",  ctrl.listOperatorCommissionPlans);

module.exports = router;
