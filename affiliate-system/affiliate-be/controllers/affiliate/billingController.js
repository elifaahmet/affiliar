const axios = require("axios");
const Operator = require("../../models/Operator");
const BillingTransaction = require("../../models/BillingTransaction");
const { PLAN_PRICES_USD } = require("../../utils/planLimits");

// Direct Sans Getirsin provider API — separate from player aggregator
const PROVIDER_BASE_URL = process.env.BILLING_PROVIDER_URL || "https://api-ke.sansgetirsin.com";
const PROVIDER_API_KEY  = process.env.BILLING_PROVIDER_API_KEY || "";
const BILLING_CALLBACK_URL = process.env.BILLING_CALLBACK_URL || "http://localhost:4141/api/billing/callback";

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

      const amount = PLAN_PRICES_USD[plan];
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

  handleCallback: async (req, res) => {
    try {
      const { transactionId, providerTransactionId, paymentStatus, referenceId, status } = req.body;

      // Normalize — provider may send status in different fields
      const txId = providerTransactionId || transactionId;
      const normalizedStatus = paymentStatus || status;

      let transaction;
      if (txId) {
        transaction = await BillingTransaction.findOne({ providerTxId: txId });
      }
      if (!transaction && referenceId) {
        transaction = await BillingTransaction.findOne({ referenceId });
      }

      if (!transaction) {
        return res.status(404).json({ error: "Transaction not found" });
      }

      // Already finalized — skip
      if (transaction.status === "paid" || transaction.status === "failed") {
        return res.json({ ok: true, alreadyProcessed: true });
      }

      if (normalizedStatus === "paid" || normalizedStatus === "completed" || normalizedStatus === "success") {
        transaction.status = "paid";
        transaction.paidAt = new Date();
        await transaction.save();

        const now = new Date();
        await Operator.findByIdAndUpdate(transaction.operatorId, {
          plan: transaction.plan,
          billingStatus: "active",
          billingCycle: now,
          nextBillingDate: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        });
      } else if (normalizedStatus === "failed" || normalizedStatus === "rejected") {
        transaction.status = "failed";
        await transaction.save();
      }

      return res.json({ ok: true });
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
