const express = require("express");
const router = express.Router();
const { list, create, update } = require("../../controllers/affiliate/brandController");

router.get("/",       list);
router.post("/",      create);
router.patch("/:id",  update);

module.exports = router;
