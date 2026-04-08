const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/affiliate/referralCodeController");

// POST   /referral-codes           → create a new random code
// GET    /referral-codes           → list my codes (operator can pass ?affiliateUserId=)
// GET    /referral-codes/:id/invite-link → get the ?ref= invite URL
// PATCH  /referral-codes/:id/activate
// PATCH  /referral-codes/:id/deactivate
// DELETE /referral-codes/:id

router.post("/", ctrl.create);
router.get("/", ctrl.list);
router.get("/:id/invite-link", ctrl.getInviteLink);
router.patch("/:id/activate", ctrl.activate);
router.patch("/:id/deactivate", ctrl.deactivate);
router.delete("/:id", ctrl.remove);

module.exports = router;
