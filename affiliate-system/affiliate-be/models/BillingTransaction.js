const mongoose = require("mongoose");

const billingTransactionSchema = new mongoose.Schema({
  operatorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Operator",
    required: true,
  },
  operatorUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  plan: {
    type: String,
    enum: ["tier1", "tier2", "plus", "plusL2", "pro"],
    required: true,
  },
  // Final amount charged to the provider — plan price minus any discount.
  amountUsd: {
    type: Number,
    required: true,
  },
  // Discount code applied at checkout (uppercased), "" if none.
  discountCode: {
    type: String,
    default: "",
  },
  // USD knocked off the plan price by `discountCode`.
  discountUsd: {
    type: Number,
    default: 0,
    min: 0,
  },
  // Snapshot of a fixed-FX discount code's resolution at this charge. Stored
  // so historical transactions show the exact rate that produced amountUsd,
  // even after the FX feed rolls forward. Empty for fixed_usd codes.
  discountFx: {
    kind:             { type: String, default: "" },        // 'fixed_fx' when used
    baseAmountCents:  { type: Number, default: 0 },         // e.g. 20000
    baseCurrency:     { type: String, default: "" },        // 'EUR'
    fxRate:           { type: Number, default: 0 },         // USD per 1 unit baseCurrency
    fxDate:           { type: Date,   default: null },      // when the rate was fetched
    _id: false,
  },
  providerTxId: {
    type: String,
    default: "",
  },
  // The Coinflux deposit the operator was given at checkout — together with
  // cryptoCurrency/network this identifies exactly where the operator was
  // told to send the payment.
  walletId: {
    type: String,
    default: "",
  },
  cryptoCurrency: {
    type: String,
    default: "",
  },
  network: {
    type: String,
    default: "",
  },
  referenceId: {
    type: String,
    unique: true,
    required: true,
  },
  paymentUrl: {
    type: String,
    default: "",
  },
  qrCode: {
    type: String,
    default: "",
  },
  address: {
    type: String,
    default: "",
  },
  status: {
    type: String,
    enum: ["pending", "paid", "failed", "expired"],
    default: "pending",
  },
  paidAt: {
    type: Date,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("BillingTransaction", billingTransactionSchema);
