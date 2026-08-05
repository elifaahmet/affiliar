const axios = require("axios");
const mongoose = require("mongoose");
const Operator = require("../../models/Operator");
const User = require("../../models/User");
const BillingTransaction = require("../../models/BillingTransaction");
const DiscountCode = require("../../models/DiscountCode");
const { PLAN_PRICES_USD, PLAN_ORDER } = require("../../utils/planLimits");

// fixed_fx discount codes are negotiated top-tier deals (e.g. "€800 flat for
// Pro"). Applying them to lower plans would either reverse-discount (pro
// $1799 → €800 ≈ $932 is genuine savings, but plus $494 → $932 would be a
// price *hike*) or look like a steal across the whole pricing ladder. Lock
// them to the most expensive plan; lower plans transparently fall back to
// list price.
const FIXED_FX_PLAN = PLAN_ORDER[PLAN_ORDER.length - 1];
const { logger } = require("../../middlewares/logger");

// Read a USD-per-{currency} rate from the daily FX feed (jobs/fxRatesJob.js).
// Rates are keyed `{CCY}_USD`; value is USD-equivalent of one unit of CCY.
// Returns null if the rate isn't loaded so the caller can surface a 400 rather
// than silently charge zero.
async function fetchFxToUsd(currency) {
  const code = `${String(currency || "").toUpperCase()}_USD`;
  const doc = await mongoose.connection.db
    .collection("exchangeRates")
    .findOne({ exchange_rate_code: code });
  if (!doc) return null;
  // value may be a Decimal128 or a double depending on which writer touched it.
  const raw = doc.value;
  const value =
    typeof raw === "object" && raw !== null && typeof raw.toString === "function"
      ? Number(raw.toString())
      : Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  return { value, date: doc.exchange_rate_date || null };
}

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

// ── Coinflux provider (opt-in via BILLING_PROVIDER=coinflux) ──────────────────
// Subscription payments as Coinflux manual-mode deposits: we ask Coinflux for a
// receive address (from the operator's own wallet pool), show it, and the
// deposit.credited webhook (once the payment is approved) activates the plan.
const BILLING_PROVIDER   = (process.env.BILLING_PROVIDER || "sans").toLowerCase();
const COINFLUX_API_URL   = process.env.COINFLUX_API_URL || "https://api.coinflux.cash";
const COINFLUX_API_KEY   = process.env.COINFLUX_API_KEY || "";
const coinflux = axios.create({
  baseURL: COINFLUX_API_URL,
  timeout: 30000,
  headers: { "Content-Type": "application/json", "X-Api-Key": COINFLUX_API_KEY },
});

// Open a Coinflux deposit → returns { depositId, address } (manual wallet mode).
async function coinfluxCreateDeposit({ operatorId, amount, referenceId }) {
  const r = await coinflux.post(
    "/deposits",
    { playerId: String(operatorId), amount, reference: referenceId, currency: "USDT", network: "TRC20" },
    { validateStatus: () => true },
  );
  if (r.status < 200 || r.status >= 300) {
    const e = new Error(r.data?.error || `coinflux deposit HTTP ${r.status}`);
    e.status = 502;
    throw e;
  }
  return { depositId: r.data.depositId, address: r.data.address };
}

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
      // 9 = crypto / USDT for our merchant. Sans accepts 1..22 (codes are
      // merchant-config-driven); probe showed 1/2/3 return zero wallets,
      // 9 returns the USDT-TRC20 receiver. Override via env when the right
      // value differs per environment.
      paymentMethod: Number(process.env.BILLING_PAYMENT_METHOD) || 9,
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
//
// Two discount shapes:
//   fixed_usd → amount = max(0, planPrice − amountUsd) on every plan.
//   fixed_fx  → amount = round(priceAmountCents/100 × FX(priceCurrency→USD))
//               but ONLY on FIXED_FX_PLAN (the top tier). On any other plan
//               the code is a transparent no-op — list price stands.
async function resolvePlanAmount({ plan, discountCode }) {
  const planPrice = PLAN_PRICES_USD[plan];
  if (!planPrice) {
    const err = new Error(
      `Invalid plan. Must be one of: ${Object.keys(PLAN_PRICES_USD).join(", ")}`,
    );
    err.status = 400;
    throw err;
  }

  if (!discountCode) {
    return { planPrice, discountUsd: 0, amount: planPrice, resolvedCode: "", discountFx: null };
  }

  const resolved = await DiscountCode.resolve(discountCode);
  if (!resolved.ok) {
    const err = new Error(resolved.error);
    err.status = 400;
    throw err;
  }
  const codeDoc = resolved.code;

  if (codeDoc.kind === "fixed_fx") {
    if (!codeDoc.priceCurrency || !codeDoc.priceAmountCents) {
      const err = new Error("Discount code is misconfigured");
      err.status = 500;
      throw err;
    }
    // Lower-tier plans transparently fall through to list price.
    if (plan !== FIXED_FX_PLAN) {
      return {
        planPrice,
        discountUsd: 0,
        amount: planPrice,
        resolvedCode: "",
        discountFx: null,
      };
    }
    const fx = await fetchFxToUsd(codeDoc.priceCurrency);
    if (!fx) {
      const err = new Error(
        `FX rate ${codeDoc.priceCurrency}→USD not available — try again shortly`,
      );
      err.status = 503;
      throw err;
    }
    // Whole-dollar rounding keeps the Sans payment amount integer-friendly.
    const amount = Math.round((codeDoc.priceAmountCents / 100) * fx.value);
    return {
      planPrice,
      discountUsd: 0,
      amount,
      resolvedCode: codeDoc.code,
      discountFx: {
        kind: "fixed_fx",
        baseAmountCents: codeDoc.priceAmountCents,
        baseCurrency: codeDoc.priceCurrency,
        fxRate: fx.value,
        fxDate: fx.date,
      },
    };
  }

  // fixed_usd (default)
  const discountUsd = Math.min(codeDoc.amountUsd, planPrice);
  const amount = Math.max(0, planPrice - discountUsd);
  return { planPrice, discountUsd, amount, resolvedCode: codeDoc.code, discountFx: null };
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
        activeDiscountCode: operator.activeDiscountCode || "",
        lifetimeFree: !!operator.lifetimeFree,
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

      // Coinflux: open a deposit and surface its address as the single wallet.
      if (BILLING_PROVIDER === "coinflux") {
        const referenceId = `affiliar_${user.operatorId}_${Date.now()}`;
        const { depositId, address } = await coinfluxCreateDeposit({
          operatorId: user.operatorId, amount, referenceId,
        });
        return res.json({
          amount, planPrice, discountUsd, discountCode: resolvedCode,
          wallets: [{
            id: depositId,               // used as walletId in initPayment
            cryptoCurrency: "USDT",
            network: "TRC20",
            address,
            label: "USDT · TRC20",
            logo: "",
          }],
        });
      }

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

      // Sans returns nested wallets:
      //   [{ _id, name, logo, accounts: [{ _id, fields: [{name,value}] }] }]
      // The operator actually picks one *account* (a specific deposit
      // address on a chain), not the wallet group, so flatten to one item
      // per account. Each account's `fields` is a free-form key/value list
      // ("Wallet", "Chain", "Address", "Network" — varies). Read case-
      // insensitively and accept a few synonyms.
      const d = listResp.data;
      const raw =
        (Array.isArray(d?.data) && d.data) ||
        (Array.isArray(d?.data?.wallets) && d.data.wallets) ||
        (Array.isArray(d?.data?.data) && d.data.data) ||
        (Array.isArray(d?.wallets) && d.wallets) ||
        (Array.isArray(d) && d) ||
        [];

      const wallets = [];
      for (const w of raw) {
        const accounts = Array.isArray(w?.accounts) ? w.accounts : [];
        for (const acc of accounts) {
          const f = {};
          for (const kv of acc?.fields || []) {
            if (kv?.name != null) f[String(kv.name).toLowerCase()] = kv.value;
          }
          const network = f.chain || f.network || "";
          const address = f.wallet || f.address || "";
          wallets.push({
            id:             String(acc?._id || ""),
            cryptoCurrency: w?.name || "",
            network,
            address,
            label:          [w?.name, network].filter(Boolean).join(" · "),
            logo:           w?.logo || "",
          });
        }
      }

      if (wallets.length === 0) {
        logger.warn("billing.sans.list_wallets.empty", {
          operatorId: String(user.operatorId),
          amount,
          status: listResp.status,
          body_preview: JSON.stringify(d ?? null).slice(0, 800),
        });
      }

      return res.json({
        amount, planPrice, discountUsd,
        discountCode: resolvedCode,
        wallets,
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

      const { amount, discountUsd, resolvedCode, discountFx } = await resolvePlanAmount({
        plan, discountCode,
      });

      const referenceId = `affiliar_${user.operatorId}_${Date.now()}`;

      // Coinflux: the deposit was already opened in listWallets; walletId IS the
      // Coinflux depositId. Just record the BillingTransaction keyed on it — the
      // deposit.credited webhook activates the plan once the payment is approved.
      if (BILLING_PROVIDER === "coinflux") {
        const transaction = await BillingTransaction.create({
          operatorId:     user.operatorId,
          operatorUser:   user._id,
          plan,
          amountUsd:      amount,
          discountCode:   resolvedCode,
          discountUsd,
          discountFx:     discountFx || undefined,
          providerTxId:   String(walletId),        // = Coinflux depositId
          referenceId,
          walletId:       String(walletId),
          cryptoCurrency: cryptoCurrency || "USDT",
          network:        network || "TRC20",
          address:        address || "",
          status:         "pending",
        });
        if (resolvedCode) {
          await Operator.updateOne({ _id: user.operatorId }, { $set: { activeDiscountCode: resolvedCode } });
        }
        return res.json({ transaction, address: transaction.address });
      }

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
        discountFx:     discountFx || undefined,
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

      // Sticky for the next cycle's pre-fill. Cleared on the day the deal
      // ends (manual operation, or by an admin endpoint we can add later).
      if (resolvedCode) {
        await Operator.updateOne(
          { _id: user.operatorId },
          { $set: { activeDiscountCode: resolvedCode } },
        );
      }

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
  //   - type:   "DEPOSIT" | "WITHDRAW"  (case-insensitive — discriminator)
  //   - status: "APPROVED" | "REJECTED"   (case-sensitive on Sans's side)
  //   - transactionId: Sans's own id (we stored it as providerTxId on create
  //                    for deposits, or sansTransactionId for AffiliatePayout)
  //
  // Provider-namespaced (/billing/sans/callback) so future gateways (Stripe,
  // etc.) can mount alongside without colliding. Single endpoint —
  // discriminate on payload.type because Sans only supports one callback URL.
  handleSansCallback: async (req, res) => {
    const body = req.body || {};
    const { action, type, transactionId, status, amount, rejectReason, extraData } = body;

    if (!action || !transactionId) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: action or transactionId",
      });
    }

    // Withdraw callbacks land here too — branch before touching BillingTransaction
    // (which is deposit-only). The handler lives on the payout controller so
    // both halves of the Sans surface stay close to their respective ledgers.
    if ((type || "").toString().toUpperCase() === "WITHDRAW") {
      const payoutCtl = require("./affiliatePayoutController");
      return payoutCtl.handleSansWithdrawCallback(req, res);
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
        // Payment also lifts a `suspended` operator back to `active` — the
        // suspended-panel middleware reads billingStatus on every request,
        // so the panel unlocks immediately. Clear pastDueAt so the next
        // cycle starts with a clean overdue anchor.
        await Operator.findByIdAndUpdate(transaction.operatorId, {
          plan: transaction.plan,
          billingStatus: "active",
          billingCycle: now,
          nextBillingDate: next,
          pastDueAt: null,
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
  // adjusted price before the operator commits to a payment. Returns the
  // shape needed to render both styles:
  //   fixed_usd → { valid, kind:'fixed_usd', code, amountUsd, applicablePlans }
  //   fixed_fx  → { valid, kind:'fixed_fx',  code, baseAmountCents,
  //                  baseCurrency, finalAmountUsd, fxRate, fxDate,
  //                  applicablePlans }
  // `applicablePlans` is the closed list of plan keys the code actually
  // discounts. Empty/missing means "all plans" (legacy fixed_usd behaviour);
  // fixed_fx codes always restrict to the top tier so the FE can render the
  // sticker / strikethrough on the right card only.
  validateDiscount: async (req, res) => {
    try {
      const resolved = await DiscountCode.resolve(req.body.code);
      if (!resolved.ok) {
        return res.status(200).json({ valid: false, error: resolved.error });
      }
      const c = resolved.code;
      if (c.kind === "fixed_fx") {
        const fx = await fetchFxToUsd(c.priceCurrency);
        if (!fx) {
          return res.status(200).json({
            valid: false,
            error: `FX rate ${c.priceCurrency}→USD not available — try again shortly`,
          });
        }
        return res.json({
          valid: true,
          kind: "fixed_fx",
          code: c.code,
          baseAmountCents: c.priceAmountCents,
          baseCurrency:    c.priceCurrency,
          finalAmountUsd:  Math.round((c.priceAmountCents / 100) * fx.value),
          fxRate:          fx.value,
          fxDate:          fx.date,
          applicablePlans: [FIXED_FX_PLAN],
        });
      }
      return res.json({
        valid: true,
        kind: "fixed_usd",
        code: c.code,
        amountUsd: c.amountUsd,
        applicablePlans: [],
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
// Internals exposed for sibling controllers (affiliatePayoutController) that
// need to drive the same Sans Getirsin merchant session — keeps the token
// cache shared instead of duplicating /payment/json calls per controller.
// Coinflux deposit webhook → activate (or fail) the subscription. Called from
// the unified Coinflux callback in affiliatePayoutController when event starts
// with "deposit.". Matches the BillingTransaction on providerTxId = depositId.
// Idempotent on terminal statuses so webhook re-deliveries are safe.
async function handleCoinfluxDeposit({ depositId, event, note }, res) {
  const transaction = await BillingTransaction.findOne({ providerTxId: depositId });
  if (!transaction) {
    logger.warn("billing.coinflux.callback.no_match", { depositId });
    return res.status(404).json({ success: false, message: "Transaction not found" });
  }
  if (["paid", "failed", "expired"].includes(transaction.status)) {
    return res.json({ success: true, status: `Deposit already ${transaction.status}` });
  }

  if (event === "deposit.credited") {
    transaction.status = "paid";
    transaction.paidAt = new Date();
    await transaction.save();
    if (transaction.discountCode) {
      await DiscountCode.updateOne(
        { code: transaction.discountCode },
        { $inc: { redemptionCount: 1 } },
      );
    }
    const now = new Date();
    const next = new Date(now);
    next.setMonth(next.getMonth() + 1);
    await Operator.findByIdAndUpdate(transaction.operatorId, {
      plan: transaction.plan,
      billingStatus: "active",
      billingCycle: now,
      nextBillingDate: next,
      pastDueAt: null,
    });
    logger.info("billing.coinflux.callback.approved", {
      depositId, plan: transaction.plan, amountUsd: transaction.amountUsd,
    });
    return res.json({ success: true, status: "Deposit approved" });
  }

  if (event === "deposit.rejected") {
    transaction.status = "failed";
    transaction.failureReason = note || "rejected";
    await transaction.save();
    logger.info("billing.coinflux.callback.rejected", { depositId, note: note || null });
    return res.json({ success: true, status: "Deposit rejected" });
  }

  return res.json({ success: true, status: "Ok" });
}

module.exports.getSansToken = getSansToken;
module.exports.sansProvider = provider;
module.exports.handleCoinfluxDeposit = handleCoinfluxDeposit;
