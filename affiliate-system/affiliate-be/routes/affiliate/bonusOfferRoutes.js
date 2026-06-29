const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/affiliate/bonusOfferController");
const requireOperatorOwner = require("../../middlewares/requireOperatorOwner");

// Operator-managed player bonus offers (distributed by affiliates). Owner-only.
router.use(requireOperatorOwner);
router.get("/", ctrl.list);
router.post("/sync", ctrl.sync);
router.post("/", ctrl.create);
router.patch("/:id", ctrl.update);
router.delete("/:id", ctrl.remove);
router.post("/:id/authorize", ctrl.authorize);
router.get("/:id/codes", ctrl.codes);
router.post("/codes/:codeId/reprovision", ctrl.reprovision);

module.exports = router;
