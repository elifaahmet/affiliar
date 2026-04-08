const express = require("express");
const router = express.Router();
const operatorController = require("../../controllers/affiliate/operatorController");

// GET /operators/plan → current plan details
router.get("/plan", operatorController.getPlan);

// GET /operators/me → current operator info
router.get("/me", operatorController.getMe);

// GET /operators/invite-link → generate invite link for affiliates
router.get("/invite-link", operatorController.getInviteLink);

module.exports = router;
