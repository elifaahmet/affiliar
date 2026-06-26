const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/affiliate/assistantController");

// In-app "Affiliar Agent" — available to both operators and affiliates.
// req.affiliateUser is already populated by the global auth gate.
router.post("/ask", ctrl.ask);

module.exports = router;
