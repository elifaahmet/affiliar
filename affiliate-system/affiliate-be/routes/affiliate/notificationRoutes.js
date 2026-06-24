const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/affiliate/notificationController");

// Any authenticated user (operator or affiliate) — scoped to self in the
// controller.
router.get("/", ctrl.list);
router.post("/read-all", ctrl.markAllRead);
router.patch("/:id/read", ctrl.markRead);

module.exports = router;
