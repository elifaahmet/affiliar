const mongoose = require("mongoose");

/**
 * A fixed-amount discount code redeemable against a subscription payment.
 *
 * Codes are platform-owned — there is no operator-facing CRUD. They are
 * created directly in the DB or via scripts/seedDiscountCodes.js. The
 * billing flow validates a code at checkout, subtracts `amountUsd` from the
 * plan price, and increments `redemptionCount` once the payment is confirmed
 * (handleCallback), so abandoned checkouts don't burn a redemption.
 */
const discountCodeSchema = new mongoose.Schema(
  {
    // Stored uppercased + trimmed; matched case-insensitively at redemption.
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    // 'fixed_usd' — subtract `amountUsd` from the plan price (legacy).
    // 'fixed_fx'  — override the plan price to `priceAmountCents` in
    //               `priceCurrency`, converted to USD at redemption time
    //               via the daily FX feed. Used for negotiated flat-fee
    //               deals (e.g. "€200/month regardless of listed tier").
    kind: {
      type: String,
      enum: ["fixed_usd", "fixed_fx"],
      default: "fixed_usd",
      required: true,
    },
    // fixed_usd only. Whole USD. Clamped to plan price at redemption so the
    // charged amount never goes negative.
    amountUsd: {
      type: Number,
      default: 0,
      min: 0,
    },
    // fixed_fx only. Override amount in `priceCurrency`, e.g. 20000 + "EUR"
    // for €200. Stored in cents to avoid float quirks.
    priceAmountCents: {
      type: Number,
      default: 0,
      min: 0,
    },
    priceCurrency: {
      type: String,
      default: "",
      uppercase: true,
      trim: true,
    },
    active: {
      type: Boolean,
      default: true,
    },
    // null = never expires.
    expiresAt: {
      type: Date,
      default: null,
    },
    // null = unlimited redemptions.
    maxRedemptions: {
      type: Number,
      default: null,
      min: 1,
    },
    redemptionCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Free-text label for whoever manages the codes (campaign name, etc.).
    note: {
      type: String,
      default: "",
    },
  },
  { timestamps: true },
);

/**
 * Resolve a code string to a usable discount. Returns { ok, code?, error? }.
 * Pure-ish — only reads. Redemption (the $inc) happens separately.
 */
discountCodeSchema.statics.resolve = async function resolve(rawCode) {
  const normalized = String(rawCode || "").trim().toUpperCase();
  if (!normalized) return { ok: false, error: "No discount code provided" };

  const doc = await this.findOne({ code: normalized });
  if (!doc || !doc.active) {
    return { ok: false, error: "Invalid or inactive discount code" };
  }
  if (doc.expiresAt && doc.expiresAt.getTime() < Date.now()) {
    return { ok: false, error: "This discount code has expired" };
  }
  if (
    doc.maxRedemptions != null &&
    doc.redemptionCount >= doc.maxRedemptions
  ) {
    return { ok: false, error: "This discount code has reached its limit" };
  }
  return { ok: true, code: doc };
};

module.exports = mongoose.model("DiscountCode", discountCodeSchema);
