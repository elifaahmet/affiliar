const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/affiliate/announcementController");
const requireOperatorOwner = require("../../middlewares/requireOperatorOwner");

// Broadcast announcements to affiliates — operator owners only.
router.use(requireOperatorOwner);
router.get("/audience", ctrl.audience);
router.post("/broadcast", ctrl.broadcast);

module.exports = router;
