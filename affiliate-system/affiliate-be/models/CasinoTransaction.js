const mongoose = require("mongoose");

const casinoTransactionSchema = new mongoose.Schema(
  {
    playerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Player",
    },
    player_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Player",
    },
    wallet_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Wallet",
    },
    providerTransactionId: {
      type: String,
    },
    type: {
      type: String,
      enum: ["bet", "rollback", "result", "error"],
    },
    amount: {
      type: Number,
    },
    providerId: {
      type: String,
    },
    gameId: {
      type: String,
      ref: "GameV2",
    },
    game_code: {
      type: String,
    },
    description: {
      type: String,
    },
    token: {
      type: String,
    },
    reqId: {
      type: String,
    },
    roundId: {
      type: String,
    },
    balance: {
      type: Number,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    collection: "casinoTransactionsV2", // Explicitly set the collection name
  }
);

casinoTransactionSchema.index({ createdAt: -1 });
casinoTransactionSchema.index({ type: 1, createdAt: -1 });
casinoTransactionSchema.index({ round_id: 1 });
casinoTransactionSchema.index({ game_code: 1 });
casinoTransactionSchema.index({ player_id: 1 });
casinoTransactionSchema.index({ currency: 1 });
casinoTransactionSchema.index({ session_id: 1 });
casinoTransactionSchema.index({ playerId: 1, type: 1 });

const CasinoTransaction = mongoose.model(
  "CasinoTransactionV2",
  casinoTransactionSchema
);
module.exports = CasinoTransaction;
