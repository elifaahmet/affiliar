const express = require("express");
const router  = express.Router();
const ctrl    = require("../controllers/platformAdminController");
const requirePlatformAdmin = require("../middlewares/requirePlatformAdmin");

router.use(requirePlatformAdmin);

router.get("/operators",  ctrl.listOperators);
router.post("/operators", ctrl.createOperator);

module.exports = router;
