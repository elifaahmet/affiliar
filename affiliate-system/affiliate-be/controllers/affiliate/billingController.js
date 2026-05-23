const axios = require("axios");
const Operator = require("../../models/Operator");
const User = require("../../models/User");
const BillingTransaction = require("../../models/BillingTransaction");
const DiscountCode = require("../../models/DiscountCode");
const { PLAN_PRICES_USD } = require("../../utils/planLimits");
const { logger } = require("../../middlewares/logger");

// Sans Getirsin payment gateway — mirrors the player-side dance:
//   1) POST /payment/json   { username, apiKey, additionalData }  → { token }
//   2) GET  /payment/deposit?amount=X   (Bearer token)            → wallet list
//   3) POST /payment/deposit { bankAccount, amount, extraData }   → transactionId
// The token is per-session (20 min upstream) so we cache it in-process per
// operator. Redis would be better for multi-instance deploys but the
// affiliate-be currently runs single-PM2-fork with Redis disabled.
// Sans's prod host is merchant-specific (the subdomain is per-account).
// Always set BILLING_PROVIDER_URL via env in deployed configs; the literal
// here is the placeholder used in playlike/pixupplay configs.
const PROVIDER_BASE_URL    = process.env.BILLING_PROVIDER_URL || "https://api-kev9ubrxgt3p9i4a.sansgetirsin.com";
const PROVIDER_API_KEY     = process.env.BILLING_PROVIDER_API_KEY || "";
const BILLING_CALLBACK_URL = process.env.BILLING_CALLBACK_URL || "http://localhost:4100/billing/sans/callback";

const provider = axios.create({
  baseURL: PROVIDER_BASE_URL + "/payment",
  timeout: 30000,
  headers: { "Content-Type": "application/json" },
});

// In-memory session-token cache: operatorId → { token, expiresAt }. TTL
// padded to 18 min so we don't hand out a token that's about to expire
// on the upstream's 20-min window.
const TOKEN_TTL_MS = 18 * 60 * 1000;
const sansTokens = new Map();

async function getSansToken(operatorId, operatorUser) {
  const key = String(operatorId);
  const cached = sansTokens.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  if (!PROVIDER_API_KEY) {
    throw new Error("BILLING_PROVIDER_API_KEY not configured");
  }

  // Mirrors the player-side payload — Sans 400s when additionalData is
  // missing userId / maxWithdrawLimit / paymentMethod. paymentMethod = 1 is
  // the default the player flow uses; if Sans rejects, the response body
  // is now logged so we can iterate without guessing.
  const body = {
    username: operatorUser?.email || String(operatorId),
    apiKey: PROVIDER_API_KEY,
    additionalData: {
      userId: String(operatorId),
      maxWithdrawLimit: 6000.0,
      paymentMethod: 1,
    },
  };
  const resp = await provider.post("/json", body, {
    validateStatus: () => true,
  });
  if (resp.status < 200 || resp.status >= 300) {
    logger.error("billing.sans.token.failed", {
      operatorId: key,
      status: resp.status,
      body: resp.data,
      requestPreview: {
        username: body.username,
        additionalData: body.additionalData,
      },
    });
    const err = new Error(
      resp.data?.error ||
        resp.data?.message ||
        `Sans /payment/json failed with ${resp.status}`,
    );
    err.status = resp.status === 401 ? 401 : 502;
    err.upstream = resp.data;
    throw err;
  }
  const token = resp.data?.data?.token || resp.data?.token;
  if (!token) {
    logger.error("billing.sans.token.no_token", { operatorId: key, body: resp.data });
    throw new Error("Sans /payment/json returned no token");
  }
  sansTokens.set(key, { token, expiresAt: Date.now() + TOKEN_TTL_MS });
  return token;
}

// Net price for a plan after an optional discount code (same rules as the
// checkout flow). Throws on invalid plan or bad code so the caller can
// return a clean 400.
async function resolvePlanAmount({ plan, discountCode }) {
  const planPrice = PLAN_PRICES_USD[plan];
  if (!planPrice) {
    const err = new Error(
      `Invalid plan. Must be one of: ${Object.keys(PLAN_PRICES_USD).join(", ")}`,
    );
    err.status = 400;
    throw err;
  }
  let discountUsd = 0;
  let resolvedCode = "";
  if (discountCode) {
    const resolved = await DiscountCode.resolve(discountCode);
    if (!resolved.ok) {
      const err = new Error(resolved.error);
      err.status = 400;
      throw err;
    }
    resolvedCode = resolved.code.code;
    discountUsd = Math.min(resolved.code.amountUsd, planPrice);
  }
  const amount = Math.max(0, planPrice - discountUsd);
  return { planPrice, discountUsd, amount, resolvedCode };
}

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

  // POST /billing/wallets — body { plan, discountCode? }
  // Step 1 of the Sans flow: open a session token for this operator and
  // return the list of receiving wallets Sans will accept for the net
  // amount. The FE renders these as a picker; the operator's choice is
  // posted back to /billing/pay.
  listWallets: async (req, res) => {
    try {
      const user = req.affiliateUser;
      if (!user.operatorId) {
        return res.status(400).json({ error: "User is not linked to an operator" });
      }
      const { amount, planPrice, discountUsd, resolvedCode } =
        await resolvePlanAmount({
          plan: req.body.plan,
          discountCode: req.body.discountCode,
        });

      const token = await getSansToken(user.operatorId, user);
      const listResp = await provider.get("/deposit", {
        params: { amount },
        headers: { Authorization: `Bearer ${token}` },
        validateStatus: () => true,
      });
      if (listResp.status < 200 || listResp.status >= 300) {
        logger.error("billing.sans.list_wallets.failed", {
          operatorId: String(user.operatorId),
          status: listResp.status,
          body: listResp.data,
        });
        return res.status(502).json({
          error: listResp.data?.error || listResp.data?.message ||
                 "Failed to fetch wallets from provider",
        });
      }

      return res.json({
        amount, planPrice, discountUsd,
        discountCode: resolvedCode,
        wallets: listResp.data?.data || listResp.data || [],
      });
    } catch (err) {
      return res.status(err.status || 500).json({ error: err.message });
    }
  },

  // POST /billing/pay — body { plan, walletId, cryptoCurrency?, network?, address?, discountCode? }
  // Step 2 of the Sans flow: with the wallet the operator picked, ask Sans
  // to create a deposit session and store our BillingTransaction keyed on
  // its transactionId. The callback (/billing/sans/callback) finalizes the
  // status when Sans confirms the payment.
  initPayment: async (req, res) => {
    try {
      const user = req.affiliateUser;
      if (!user.operatorId) {
        return res.status(400).json({ error: "User is not linked to an operator" });
      }
      const { plan, walletId, cryptoCurrency, network, address, discountCode } = req.body || {};
      if (!walletId) {
        return res.status(400).json({ error: "walletId is required — pick a wallet first" });
      }

      const { amount, discountUsd, resolvedCode } = await resolvePlanAmount({
        plan, discountCode,
      });

      const referenceId = `affiliar_${user.operatorId}_${Date.now()}`;
      const token = await getSansToken(user.operatorId, user);

      const providerReq = {
        bankAccount: walletId,
        amount,
        extraData: {
          service: "affiliar",
          plan,
          operatorId: String(user.operatorId),
          operatorUser: String(user._id),
          referenceId,
          callbackUrl: BILLING_CALLBACK_URL,
          cryptoCurrency: cryptoCurrency || null,
          network: network || null,
        },
      };

      const providerResp = await provider.post("/deposit", providerReq, {
        headers: { Authorization: `Bearer ${token}` },
        validateStatus: () => true,
      });
      if (
        providerResp.status < 200 ||
        providerResp.status >= 300 ||
        providerResp.data?.error
      ) {
        // Session expired? Clear the cached token so the next call refreshes.
        if (providerResp.status === 401) sansTokens.delete(String(user.operatorId));
        logger.error("billing.sans.deposit.failed", {
          operatorId: String(user.operatorId),
          status: providerResp.status,
          body: providerResp.data,
        });
        return res.status(providerResp.status === 401 ? 400 : 502).json({
          error: providerResp.data?.error || providerResp.data?.message ||
                 "Deposit declined by provider",
          ...(providerResp.status === 401 && { errorCode: "SANS_SESSION_EXPIRED" }),
        });
      }

      const externalId =
        providerResp.data?.data?.transactionId ||
        providerResp.data?.transactionId ||
        providerResp.data?.id || "";
      if (!externalId) {
        logger.error("billing.sans.deposit.no_tx_id", {
          operatorId: String(user.operatorId),
          body: providerResp.data,
        });
        return res.status(502).json({ error: "Provider did not return a transactionId" });
      }

      const transaction = await BillingTransaction.create({
        operatorId:     user.operatorId,
        operatorUser:   user._id,
        plan,
        amountUsd:      amount,
        discountCode:   resolvedCode,
        discountUsd,
        providerTxId:   externalId,
        referenceId,
        walletId,
        cryptoCurrency: cryptoCurrency || "",
        network:        network || "",
        address:        address || providerResp.data?.data?.address || "",
        paymentUrl:     providerResp.data?.data?.paymentUrl || "",
        qrCode:         providerResp.data?.data?.qrCode || "",
        status:         "pending",
      });

      return res.json({
        transaction,
        paymentUrl: transaction.paymentUrl,
        qrCode:     transaction.qrCode,
        address:    transaction.address,
      });
    } catch (err) {
      return res.status(err.status || 500).json({ error: err.message });
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
