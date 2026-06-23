const express = require("express");
const router = express.Router();
const clickController = require("../../controllers/affiliate/clickController");

// Public click tracker — hit by end users, no auth. Mounted before the global
// authorize() gate (see index.js).
router.get("/:code", clickController.redirect);

module.exports = router;
