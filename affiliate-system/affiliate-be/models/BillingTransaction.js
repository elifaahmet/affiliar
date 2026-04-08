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
    enum: ["starter", "growth", "scale"],
    required: true,
  },
  amountUsd: {
    type: Number,
    required: true,
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
