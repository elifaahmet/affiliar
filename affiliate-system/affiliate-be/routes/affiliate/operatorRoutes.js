const express = require("express");
const router = express.Router();
const operatorController = require("../../controllers/affiliate/operatorController");
const requireOperatorOwner = require("../../middlewares/requireOperatorOwner");

// GET /operators/plan → current plan details
router.get("/plan", operatorController.getPlan);

// GET /operators/me → current operator info
router.get("/me", operatorController.getMe);

// GET /operators/invite-link → generate invite link for affiliates
router.get("/invite-link", operatorController.getInviteLink);

// Team management (brand-scoped operator users). List is readable by any
// operator user; invite/remove are owner-only.
router.get("/team", operatorController.listTeam);
router.post("/team", requireOperatorOwner, operatorController.inviteTeamMember);
router.patch("/team/:userId", requireOperatorOwner, operatorController.updateTeamMember);
router.delete("/team/:userId", requireOperatorOwner, operatorController.removeTeamMember);

module.exports = router;
