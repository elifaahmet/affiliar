const mongoose = require("mongoose");

const DepositTransactionSchema = new mongoose.Schema(
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
      type: String, // e.g., "TXN-20240527-0001"
      required: true,
      unique: true,
    },
    tx_hash: {
      type: String,
    },
    network: {
      type: String,
    },
    depositAddress: {
      type: String,
    },
    currency: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    cryptoCurrency: {
      type: String,
    },
    country: {
      type: String,
    },
    bonusEligible: {
      type: Boolean,
      default: false,
    },
    amount: {
      type: mongoose.Schema.Types.Decimal128,
    },
    cryptoDetails: {
      crypto_amount: {
        type: mongoose.Schema.Types.Mixed,
      },
    },

    status: {
      type: String,
      enum: [
        "created",
        "pending",
        "intent", // Payment process started
        "started", // Player is on the payment page
        "authorized", // Card authorized
        "received", // YupGo received the fiat
        "settled", // USDT has been sent to your wallet
        "completed", // Final success state
        "success", // (Legacy/Alternative success state)
        "failed", // Payment failed
        "expired", // Player didn't pay in time
        "disputed", // Chargeback/Dispute
        "pending_confirmation", // Waiting for 3DS or manual check
        "refunded",
        "confirmed",
        "failed",
        "canceled",
        "reversing",
        "reversed",
      ],
      default: "created",
    },

    method: {
      type: String,
      required: true,
      enum: [
        "crypto",
        "bank",
        "card",
        "correction",
        "bank_account",
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
      type: String, // From PayTM, Payzeasy etc.
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
    },
    rejection: {
      rejectedTransactionRefId: {
        type: String,
      },
      rejectedAmount: {
        type: Number,
      },
      rejectedAt: {
        type: Date,
      },
      rejectedBy: {
        type: String,
      },
      reasonCode: {
        type: String,
      },
      reason: {
        type: String,
      },
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
    failed_at: {
      type: Date,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("DepositTransaction", DepositTransactionSchema);
