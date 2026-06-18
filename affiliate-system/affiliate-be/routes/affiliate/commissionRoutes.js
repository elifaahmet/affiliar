const express = require("express");
const router  = express.Router();
const { planController, reportController, affiliatePlanController } =
  require("../../controllers/affiliate/commissionController");
const { checkCommissionType } = require("../../middlewares/planGuard");
const requireOperatorOwner = require("../../middlewares/requireOperatorOwner");

// Owner-only section: commission plans/reports are operator-wide (no brand
// dimension), so brand-scoped operator users are blocked.
router.use(requireOperatorOwner);

// ── Plans ─────────────────────────────────────────────────────────────────────
router.get("/plans",              planController.list);
router.post("/plans",             checkCommissionType, planController.create);
router.patch("/plans/:id",        planController.update);
router.delete("/plans/:id",       planController.remove);
router.post("/plans/:id/default", planController.setDefault);

// ── Reports ───────────────────────────────────────────────────────────────────
router.get("/reports",                      reportController.list);
router.post("/reports/calculate",           reportController.calculate);
router.post("/reports/submit",              reportController.submitForApproval);
router.post("/reports/approve",             reportController.approve);
router.post("/reports/mark-paid",           reportController.markPaid);
router.patch("/reports/:id/notes",          reportController.updateNotes);

// ── Affiliate plan assignment ─────────────────────────────────────────────────
router.patch("/affiliates/:affiliateId/plan", affiliatePlanController.assignPlan);

module.exports = router;
