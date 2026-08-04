const express = require("express");
const router = express.Router();
const billingController = require("../../controllers/affiliate/billingController");

// GET /billing → billing status
router.get("/", billingController.getBillingStatus);

// POST /billing/wallets → step 1: list Sans receiving wallets for the
// net amount of the chosen plan. Body: { plan, discountCode? }
router.post("/wallets", billingController.listWallets);

// POST /billing/pay → step 2: with the picked walletId, ask Sans to open
// a deposit session and create the local BillingTransaction.
router.post("/pay", billingController.initPayment);

// POST /billing/discount/validate → preview a discount code
router.post("/discount/validate", billingController.validateDiscount);

// POST /billing/sans/callback → Sans Getirsin webhook (public; whitelisted in
// index.js publicAuthPaths so it bypasses the operator/affiliate auth gate).
// Provider-namespaced so we can add /stripe/callback etc. later.
router.post("/sans/callback", billingController.handleSansCallback);

// POST /billing/coinflux/callback → Coinflux withdrawal webhook (public;
// whitelisted in index.js). HMAC-verified inside the handler.
router.post(
  "/coinflux/callback",
  require("../../controllers/affiliate/affiliatePayoutController").handleCoinfluxWithdrawCallback,
);

// GET /billing/transactions → list transactions
router.get("/transactions", billingController.getTransactions);

module.exports = router;
