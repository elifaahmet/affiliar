const express = require("express");
const router = express.Router();
const { list, create, update } = require("../../controllers/affiliate/brandController");
const { checkMaxBrands } = require("../../middlewares/planGuard");

router.get("/",       list);
// Gate new-brand creation on the operator's plan cap. Existing brands
// keep working if the plan caps drop later — only fresh creates 403.
router.post("/",      checkMaxBrands, create);
router.patch("/:id",  update);

module.exports = router;
