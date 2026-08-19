const express = require("express");
const router = express.Router();
const billingController = require("../../controllers/affiliate/billingController");

// GET /billing → billing status
router.get("/", billingController.getBillingStatus);

// POST /billing/wallets → step 1: open a Coinflux deposit for the net amount
// of the chosen plan and return its receive address. Body: { plan, discountCode? }
router.post("/wallets", billingController.listWallets);

// POST /billing/pay → step 2: with the picked walletId (= the depositId from
// step 1), create the local BillingTransaction.
router.post("/pay", billingController.initPayment);

// POST /billing/discount/validate → preview a discount code
router.post("/discount/validate", billingController.validateDiscount);

// POST /billing/coinflux/callback → Coinflux webhook, deposits and withdrawals
// both (public; whitelisted in index.js publicAuthPaths so it bypasses the
// operator/affiliate auth gate). HMAC-verified inside the handler.
// Provider-namespaced so we can add /stripe/callback etc. later.
router.post(
  "/coinflux/callback",
  require("../../controllers/affiliate/affiliatePayoutController").handleCoinfluxWithdrawCallback,
);

// GET /billing/transactions → list transactions
router.get("/transactions", billingController.getTransactions);

module.exports = router;
