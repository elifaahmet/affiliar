const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/affiliate/fraudController");
const requireOperatorOwner = require("../../middlewares/requireOperatorOwner");

// Operator anti-fraud: review flagged players + rescan + override. Owner-only
// (no brand dimension on the fraud flag).
router.use(requireOperatorOwner);
router.get("/", ctrl.list);
router.post("/scan", ctrl.scan);
router.patch("/:playerId", ctrl.setFlag);

module.exports = router;
