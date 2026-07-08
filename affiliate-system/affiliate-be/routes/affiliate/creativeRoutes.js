const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/affiliate/creativeController");
const requireOperatorOwner = require("../../middlewares/requireOperatorOwner");
const { checkCreatives } = require("../../middlewares/planGuard");

// Operator-managed creative library. Owner-only, and a tier2+ plan feature.
router.use(requireOperatorOwner);
router.use(checkCreatives);
router.get("/", ctrl.list);
router.post("/", ctrl.create);
router.patch("/:id", ctrl.update);
router.delete("/:id", ctrl.remove);

module.exports = router;
