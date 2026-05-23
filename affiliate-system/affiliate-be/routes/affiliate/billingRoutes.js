const express = require("express");
const router = express.Router();
const billingController = require("../../controllers/affiliate/billingController");

// GET /billing → billing status
router.get("/", billingController.getBillingStatus);

// POST /billing/pay → initiate payment
router.post("/pay", billingController.initPayment);

// POST /billing/discount/validate → preview a discount code
router.post("/discount/validate", billingController.validateDiscount);

// POST /billing/callback → provider webhook (public; whitelisted in index.js
// publicAuthPaths so it bypasses the operator/affiliate auth gate).
router.post("/callback", billingController.handleCallback);

// GET /billing/transactions → list transactions
router.get("/transactions", billingController.getTransactions);

module.exports = router;
