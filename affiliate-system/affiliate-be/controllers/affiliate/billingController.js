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

// ── Coinflux provider ─────────────────────────────────────────────────────────
// Subscription payments are Coinflux manual-mode deposits: we ask Coinflux for a
// receive address (from the operator's own wallet pool), show it, and the
// deposit.credited webhook (once the payment is approved) activates the plan.
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
    // Whole-dollar rounding keeps the deposit amount integer-friendly.
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
  // Step 1 of the checkout: open a Coinflux deposit for the net amount and
  // return its receive address. The FE renders the (single-entry) list as a
  // picker; the operator's choice is posted back to /billing/pay.
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

      // Open a deposit and surface its address as the single wallet.
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
    } catch (err) {
      return res.status(err.status || 500).json({ error: err.message });
    }
  },

  // POST /billing/pay — body { plan, walletId, cryptoCurrency?, network?, address?, discountCode? }
  // Step 2 of the checkout: record the BillingTransaction against the deposit
  // opened in step 1. The callback (/billing/coinflux/callback) finalizes the
  // status when Coinflux credits the deposit.
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

      // The deposit was already opened in listWallets; walletId IS the Coinflux
      // depositId. Just record the BillingTransaction keyed on it — the
      // deposit.credited webhook activates the plan once the payment is approved.
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
      // Sticky for the next cycle's pre-fill.
      if (resolvedCode) {
        await Operator.updateOne({ _id: user.operatorId }, { $set: { activeDiscountCode: resolvedCode } });
      }
      return res.json({ transaction, address: transaction.address });
    } catch (err) {
      return res.status(err.status || 500).json({ error: err.message });
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

module.exports.handleCoinfluxDeposit = handleCoinfluxDeposit;
