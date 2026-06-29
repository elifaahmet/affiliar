const mongoose = require("mongoose");

// Cache of player_id → username, pulled from the operator's casino (which is the
// source of truth; affiliate events don't carry usernames). Lets the players
// list + leaderboard show readable names. Covers organic players too (keyed by
// playerId, not the affiliate registry).
const playerNameSchema = new mongoose.Schema(
  {
    operatorId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    playerId:   { type: String, required: true },
    username:   { type: String, default: null },
  },
  { timestamps: true },
);

playerNameSchema.index({ operatorId: 1, playerId: 1 }, { unique: true });

module.exports = mongoose.model("PlayerName", playerNameSchema);
