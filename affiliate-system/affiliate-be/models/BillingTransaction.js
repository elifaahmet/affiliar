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
  providerTxId: {
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
