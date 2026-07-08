const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/affiliate/affiliateController");
const { checkAffiliateLimit, checkSubAffiliates, checkBulkImport } = require("../../middlewares/planGuard");

// Brands must come before /:id to avoid route conflict
// GET  /affiliates/brands       → list operator's brands
// POST /affiliates/brands       → create a brand
router.get("/brands", ctrl.listBrands);
router.post("/brands", ctrl.createBrand);

// Affiliates (operator only)
router.get("/",        ctrl.list);
router.post("/",       checkAffiliateLimit, ctrl.create);
router.post("/bulk",   checkBulkImport, checkAffiliateLimit, ctrl.bulkCreate);
router.get("/:id",                  ctrl.getOne);
router.patch("/:id/parent",         checkSubAffiliates, ctrl.setParent);
router.get("/:id/sub-affiliates",   ctrl.listSubAffiliates);

module.exports = router;
