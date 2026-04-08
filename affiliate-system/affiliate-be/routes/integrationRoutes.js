const express = require("express");
const router = express.Router();
const { importActivity } = require("../controllers/integrationController");
const playerIntegration = require("../controllers/integration/playerIntegrationController");

router.post("/activity", importActivity);

// Player registration endpoints — called by operator's backend
router.post("/player/register", playerIntegration.register);
router.post("/player/bulk", playerIntegration.bulkRegister);

module.exports = router;
