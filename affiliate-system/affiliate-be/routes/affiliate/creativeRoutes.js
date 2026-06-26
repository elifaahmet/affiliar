const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/affiliate/creativeController");
const requireOperatorOwner = require("../../middlewares/requireOperatorOwner");

// Operator-managed creative library. Owner-only.
router.use(requireOperatorOwner);
router.get("/", ctrl.list);
router.post("/", ctrl.create);
router.patch("/:id", ctrl.update);
router.delete("/:id", ctrl.remove);

module.exports = router;
