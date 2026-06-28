const mongoose = require("mongoose");

// A redemption of an affiliate bonus code by a player, reported by the casino
// (Phase 2 wiring). Lets the operator and affiliate see how a distributed bonus
// is performing.
const bonusClaimSchema = new mongoose.Schema(
  {
    offerId:     { type: mongoose.Schema.Types.ObjectId, ref: "BonusOffer", required: true, index: true },
    codeId:      { type: mongoose.Schema.Types.ObjectId, ref: "AffiliateBonusCode", default: null },
    operatorId:  { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    affiliateId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    playerId:    { type: String, required: true },
    code:        { type: String, default: null },
    source:      { type: String, enum: ["code", "link"], default: "code" },
    amountCents: { type: Number, default: null },
    currency:    { type: String, default: "EUR" },
    status:      { type: String, default: "granted" }, // granted | wagering | converted | expired
    claimedAt:   { type: Date, default: Date.now },
  },
  { timestamps: true },
);

// One claim per (player, code) — a casino re-report is idempotent.
bonusClaimSchema.index({ codeId: 1, playerId: 1 }, { unique: true, partialFilterExpression: { codeId: { $type: "objectId" } } });

module.exports = mongoose.model("BonusClaim", bonusClaimSchema);
