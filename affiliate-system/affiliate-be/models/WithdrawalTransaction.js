const mongoose = require("mongoose");

const WithdrawalTransactionSchema = new mongoose.Schema(
  {
    walletId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Wallet",
      required: true,
    },
    playerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Player",
      required: true,
    },
    tx_id: {
      type: String, // Internal readable ID
      required: true,
      unique: true,
    },
    isApproved: {
      type: Boolean,
      default: false,
    },
    approved: {
      approved_at: {
        type: Date,
      },
      approved_by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    },
    currency: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Currency",
      required: true,
    },
    country: {
      type: String,
    },
    amount: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
    },
    retry_count: {
      type: Number,
      default: 5,
      min: 0,
    },
    status: {
      type: String,
      enum: [
        "created",
        "pending",
        "processing",
        "confirmed",
        "rejected",
        "success",
        "error",
        "refunded",
      ],
      default: "created",
    },
    method: {
      type: String,
      enum: [
        "crypto",
        "correction",
        "bank",
        "card",
        "upi",
        "voucher",
        "admin",
        "pix",
        "mobile_money",
        "neteller",
        "skrill",
        "cash",
        "apple_pay",
        "google_pay",
      ],
    },
    provider: {
      type: String,
    },
    external_tx_id: {
      type: String,
    },
    addressData: {
      crypto_address: { type: String },
      network: { type: String },
      account_number: { type: String },
      ifsc_code: { type: String },
      account_holder: { type: String },
    },
    idempotency_key: {
      type: String,
      unique: true,
      sparse: true,
    },
    note: {
      type: String,
    },
    confirmed_at: {
      type: Date,
    },
    rollback_finalized_at: {
      type: Date,
    },
    cryptoDetails: {
      payment_id: { type: String },
      network: { type: String },
      wallet_address: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "WithdrawAddress",
      },
      wallet_type: { type: String },
    },
    rejection: {
      rejected_by: { type: String },
      rejected_at: { type: Date },
      reject_reason_code: {
        type: String,
        enum: [
          "KYC_INCOMPLETE",
          "FRAUD_SUSPECTED",
          "BALANCE_TOO_LOW",
          "LIMIT_EXCEEDED",
          "ADMIN_REJECTED",
        ],
      },
      reject_reason: { type: String },
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model(
  "WithdrawalTransaction",
  WithdrawalTransactionSchema
);
