const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/affiliate/bonusOfferController");
const requireOperatorOwner = require("../../middlewares/requireOperatorOwner");
const { checkPlayerBonuses } = require("../../middlewares/planGuard");

// Operator-managed player bonus offers (distributed by affiliates). Owner-only,
// and a Plus+ plan feature.
router.use(requireOperatorOwner);
router.use(checkPlayerBonuses);
router.get("/", ctrl.list);
router.get("/casino-config", ctrl.getConfig);
router.patch("/casino-config", ctrl.setConfig);
router.post("/sync", ctrl.sync);
router.post("/", ctrl.create);
router.patch("/:id", ctrl.update);
router.delete("/:id", ctrl.remove);
router.post("/:id/authorize", ctrl.authorize);
router.get("/:id/codes", ctrl.codes);
router.post("/codes/:codeId/reprovision", ctrl.reprovision);

module.exports = router;
