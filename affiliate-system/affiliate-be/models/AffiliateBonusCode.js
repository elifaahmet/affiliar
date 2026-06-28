const mongoose = require("mongoose");

// One affiliate's distributable sub-code for a bonus offer. Each sub-code is
// provisioned in the casino as its own bonus definition (the casino supports
// multiple codes), giving clean per-affiliate attribution: when a player
// redeems CODE, the casino knows which affiliate it belongs to.
const affiliateBonusCodeSchema = new mongoose.Schema(
  {
    offerId:     { type: mongoose.Schema.Types.ObjectId, ref: "BonusOffer", required: true, index: true },
    operatorId:  { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    affiliateId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    code:        { type: String, required: true, uppercase: true, trim: true },
    status:      { type: String, enum: ["active", "disabled"], default: "active" },

    // Casino provisioning state for this code's bonus definition.
    provision: {
      status:        { type: String, enum: ["pending", "created", "failed"], default: "pending" },
      externalBonusId: { type: String, default: null },
      error:         { type: String, default: null },
      syncedAt:      { type: Date, default: null },
    },

    claimsCount: { type: Number, default: 0 }, // denormalised redemption count
  },
  { timestamps: true },
);

affiliateBonusCodeSchema.index({ offerId: 1, affiliateId: 1 }, { unique: true });
affiliateBonusCodeSchema.index({ code: 1 }, { unique: true });

module.exports = mongoose.model("AffiliateBonusCode", affiliateBonusCodeSchema);
