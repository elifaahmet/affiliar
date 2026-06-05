const express = require("express");
const router = express.Router();
const { list, create, update } = require("../../controllers/affiliate/brandController");
const brandPages = require("../../controllers/affiliate/brandPageController");
const { checkMaxBrands } = require("../../middlewares/planGuard");

router.get("/",       list);
// Gate new-brand creation on the operator's plan cap. Existing brands
// keep working if the plan caps drop later — only fresh creates 403.
router.post("/",      checkMaxBrands, create);
router.patch("/:id",  update);

// Operator-defined custom pages, nested under their brand. These paths are
// more specific than /:id, so there's no collision with the routes above.
router.get   ("/:brandId/pages",         brandPages.list);
router.post  ("/:brandId/pages",         brandPages.create);
router.patch ("/:brandId/pages/:pageId", brandPages.update);
router.delete("/:brandId/pages/:pageId", brandPages.remove);

module.exports = router;
