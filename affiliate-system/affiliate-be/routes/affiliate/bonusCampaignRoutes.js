const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/affiliate/bonusCampaignController");
const requireOperatorOwner = require("../../middlewares/requireOperatorOwner");

// Operator-managed performance bonus campaigns. Owner-only.
router.use(requireOperatorOwner);
router.get("/metrics", ctrl.metricsCatalog);
router.get("/", ctrl.list);
router.post("/", ctrl.create);
router.patch("/:id", ctrl.update);
router.delete("/:id", ctrl.remove);
router.get("/:id/progress", ctrl.progress);
router.post("/:id/evaluate", ctrl.evaluate);
router.post("/awards/:awardId/mark-paid", ctrl.markAwardPaid);

module.exports = router;
