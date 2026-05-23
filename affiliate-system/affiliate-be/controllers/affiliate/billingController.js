const axios = require("axios");
const Operator = require("../../models/Operator");
const BillingTransaction = require("../../models/BillingTransaction");
const DiscountCode = require("../../models/DiscountCode");
const { PLAN_PRICES_USD } = require("../../utils/planLimits");
const { logger } = require("../../middlewares/logger");

// Direct Sans Getirsin provider API — separate from player aggregator
const PROVIDER_BASE_URL = process.env.BILLING_PROVIDER_URL || "https://api-ke.sansgetirsin.com";
const PROVIDER_API_KEY  = process.env.BILLING_PROVIDER_API_KEY || "";
const BILLING_CALLBACK_URL = process.env.BILLING_CALLBACK_URL || "http://localhost:4100/billing/sans/callback";

const provider = axios.create({
  baseURL: PROVIDER_BASE_URL,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${PROVIDER_API_KEY}`,
  },
});

const billingController = {
  getBillingStatus: async (req, res) => {
    try {
      const user = req.affiliateUser;

      if (!user.operatorId) {
        return res.status(400).json({ error: "User is not linked to an operator" });
      }

      const operator = await Operator.findById(user.operatorId).lean();
      if (!operator || operator.isDeleted) {
        return res.status(404).json({ error: "Operator not found" });
      }

      const recentTransactions = await BillingTransaction.find({
        operatorId: operator._id,
      })
        .sort({ createdAt: -1 })
        .limit(5)
        .lean();

      return res.json({
        plan: operator.plan,
        billingStatus: operator.billingStatus,
        trialEndsAt: operator.trialEndsAt,
        nextBillingDate: operator.nextBillingDate,
        billingCycle: operator.billingCycle,
        transactions: recentTransactions,
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },

  initPayment: async (req, res) => {
    try {
      const user = req.affiliateUser;
      const { plan } = req.body;

      if (!plan || !PLAN_PRICES_USD[plan]) {
        return res.status(400).json({
          error: `Invalid plan. Must be one of: ${Object.keys(PLAN_PRICES_USD).join(", ")}`,
        });
      }

      if (!user.operatorId) {
        return res.status(400).json({ error: "User is not linked to an operator" });
      }

      const planPrice = PLAN_PRICES_USD[plan];

      // Optional fixed-amount discount code. Clamped to the plan price so
      // the charged amount never goes negative. redemptionCount is bumped
      // later, on payment confirmation (handleCallback).
      let discountUsd = 0;
      let discountCode = "";
      if (req.body.discountCode) {
        const resolved = await DiscountCode.resolve(req.body.discountCode);
        if (!resolved.ok) {
          return res.status(400).json({ error: resolved.error });
        }
        discountCode = resolved.code.code;
        discountUsd = Math.min(resolved.code.amountUsd, planPrice);
      }
      const amount = Math.max(0, planPrice - discountUsd);

      const referenceId = `affiliar_${user.operatorId}_${Date.now()}`;

      // Call provider directly — create payment session
      const providerRes = await provider.post("/api/payment/create", {
        amount,
        currency: "USDT",
        referenceId,
        callbackUrl: BILLING_CALLBACK_URL,
        metadata: {
          service: "affiliar",
          plan,
          operatorId: user.operatorId.toString(),
          operatorUser: user._id.toString(),
        },
      });

      const providerData = providerRes.data;

      // Save billing transaction
      const transaction = await BillingTransaction.create({
        operatorId: user.operatorId,
        operatorUser: user._id,
        plan,
        amountUsd: amount,
        discountCode,
        discountUsd,
        providerTxId: providerData.transactionId || providerData.id || "",
        referenceId,
        paymentUrl: providerData.paymentUrl || "",
        qrCode: providerData.qrCode || "",
        address: providerData.address || providerData.walletAddress || "",
        status: "pending",
      });

      return res.json({
        transaction,
        paymentUrl: providerData.paymentUrl || "",
        qrCode: providerData.qrCode || "",
        address: providerData.address || providerData.walletAddress || "",
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },

  // Sans Getirsin webhook handler. Mirrors the player-side dispatch in
  //   new-pixup/player-system/.../transactionsRoute.js  POST /player/transactions/sans/callback
  // so the same upstream payloads work here.
  //
  // Sans posts: { action, type?, transactionId, status, amount?,
  //               rejectReason?, extraData?, ... }
  //   - action: "TRANSACTION_STATUS_CHANGE" | "CHANGED_TRANSACTION_AMOUNT" | …
  //   - status: "APPROVED" | "REJECTED"   (case-sensitive on Sans's side)
  //   - transactionId: Sans's own id (we stored it as providerTxId on create)
  //
  // Provider-namespaced (/billing/sans/callback) so future gateways (Stripe,
  // etc.) can mount alongside without colliding.
  handleSansCallback: async (req, res) => {
    const body = req.body || {};
    const { action, transactionId, status, amount, rejectReason, extraData } = body;

    if (!action || !transactionId) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: action or transactionId",
      });
    }

    try {
      const transaction = await BillingTransaction.findOne({
        providerTxId: transactionId,
      });
      if (!transaction) {
        return res.status(404).json({
          success: false,
          message: "Transaction not found",
        });
      }

      // Idempotent: re-deliveries of the same callback don't re-flip state
      // and (importantly) don't double-burn a discount redemption.
      if (transaction.status === "paid") {
        return res.json({ success: true, status: "Deposit already approved" });
      }
      if (transaction.status === "failed") {
        return res.json({ success: true, status: "Deposit already rejected" });
      }
      if (transaction.status === "expired") {
        return res.json({ success: true, status: "Transaction already expired" });
      }

      const knownAction =
        action === "TRANSACTION_STATUS_CHANGE" ||
        action === "CHANGED_TRANSACTION_AMOUNT";

      if (!knownAction) {
        logger.info("billing.sans.callback.unknown_action", {
          transactionId, action, status,
        });
        return res.json({ success: true, status: "Ok" });
      }

      // Amount may have been corrected by the provider/back-office on the
      // CHANGED_TRANSACTION_AMOUNT path. Record it so the receipt matches
      // what was actually charged.
      if (action === "CHANGED_TRANSACTION_AMOUNT" && amount != null) {
        const n = Number(amount);
        if (Number.isFinite(n) && n >= 0) transaction.amountUsd = n;
      }

      if (status === "APPROVED") {
        transaction.status = "paid";
        transaction.paidAt = new Date();
        await transaction.save();

        // Burn the discount only on confirmed payment — abandoned/rejected
        // checkouts never reach this branch.
        if (transaction.discountCode) {
          await DiscountCode.updateOne(
            { code: transaction.discountCode },
            { $inc: { redemptionCount: 1 } },
          );
        }

        // Roll the cycle forward by one calendar month, not 30 days, so the
        // anniversary doesn't drift back ~5 days a year.
        const now = new Date();
        const next = new Date(now);
        next.setMonth(next.getMonth() + 1);
        await Operator.findByIdAndUpdate(transaction.operatorId, {
          plan: transaction.plan,
          billingStatus: "active",
          billingCycle: now,
          nextBillingDate: next,
        });

        logger.info("billing.sans.callback.approved", {
          transactionId, plan: transaction.plan, amountUsd: transaction.amountUsd,
        });
        return res.json({ success: true, status: "Deposit approved" });
      }

      if (status === "REJECTED") {
        transaction.status = "failed";
        await transaction.save();
        logger.info("billing.sans.callback.rejected", {
          transactionId, rejectReason: rejectReason || null,
        });
        return res.json({ success: true, status: "Deposit rejected" });
      }

      // Known action but an unfamiliar status — ack and log so we can
      // iterate without dropping callbacks.
      logger.info("billing.sans.callback.unknown_status", {
        transactionId, action, status,
        extraData_preview: extraData ? JSON.stringify(extraData).slice(0, 200) : null,
      });
      return res.json({ success: true, status: "Ok" });
    } catch (err) {
      logger.error("billing.sans.callback.handler_err", {
        transactionId, action, status,
        error_message: err?.message,
        error_stack: err?.stack,
      });
      return res.status(500).json({
        success: false,
        message: err?.message || "Internal error",
      });
    }
  },

  // POST /billing/discount/validate — body { code }
  // Read-only preview of a discount code so the billing page can show the
  // adjusted price before the operator commits to a payment.
  validateDiscount: async (req, res) => {
    try {
      const resolved = await DiscountCode.resolve(req.body.code);
      if (!resolved.ok) {
        return res.status(200).json({ valid: false, error: resolved.error });
      }
      return res.json({
        valid: true,
        code: resolved.code.code,
        amountUsd: resolved.code.amountUsd,
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },

  getTransactions: async (req, res) => {
    try {
      const user = req.affiliateUser;

      if (!user.operatorId) {
        return res.status(400).json({ error: "User is not linked to an operator" });
      }

      const transactions = await BillingTransaction.find({
        operatorId: user.operatorId,
      })
        .sort({ createdAt: -1 })
        .lean();

      return res.json(transactions);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },
};

module.exports = billingController;
