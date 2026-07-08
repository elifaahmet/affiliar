const express = require("express");
const router = express.Router();
const operatorController = require("../../controllers/affiliate/operatorController");
const requireOperatorOwner = require("../../middlewares/requireOperatorOwner");
const { checkTeam } = require("../../middlewares/planGuard");

// GET /operators/plan → current plan details
router.get("/plan", operatorController.getPlan);

// GET /operators/player-usage → monthly active players vs plan cap
router.get("/player-usage", operatorController.playerUsage);

// GET /operators/me → current operator info
router.get("/me", operatorController.getMe);

// GET /operators/invite-link → generate invite link for affiliates
router.get("/invite-link", operatorController.getInviteLink);

// Team management (brand-scoped operator users). List is readable by any
// operator user; invite/remove are owner-only AND a Plus+ feature (multi-user
// team). tier1/tier2 stay single-user (the owner), so listing still works.
router.get("/team", operatorController.listTeam);
router.post("/team", requireOperatorOwner, checkTeam, operatorController.inviteTeamMember);
router.patch("/team/:userId", requireOperatorOwner, checkTeam, operatorController.updateTeamMember);
router.delete("/team/:userId", requireOperatorOwner, checkTeam, operatorController.removeTeamMember);

module.exports = router;
