const express = require("express");
const router = express.Router();
const billingController = require("../../controllers/affiliate/billingController");

// GET /billing → billing status
router.get("/", billingController.getBillingStatus);

// POST /billing/pay → initiate payment
router.post("/pay", billingController.initPayment);

// POST /billing/discount/validate → preview a discount code
router.post("/discount/validate", billingController.validateDiscount);

// POST /billing/sans/callback → Sans Getirsin webhook (public; whitelisted in
// index.js publicAuthPaths so it bypasses the operator/affiliate auth gate).
// Provider-namespaced so we can add /stripe/callback etc. later.
router.post("/sans/callback", billingController.handleSansCallback);

// GET /billing/transactions → list transactions
router.get("/transactions", billingController.getTransactions);

module.exports = router;
