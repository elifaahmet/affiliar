const mongoose = require("mongoose");

// An operator-defined player bonus that affiliates can distribute to their own
// players. The offer is the template; each authorised affiliate gets their own
// sub-code (see AffiliateBonusCode), and each sub-code is provisioned as a real
// bonus definition in the casino (pixup bonus-management) so it can actually be
// applied. Fields mirror the casino bonus-definition shape.
const bonusOfferSchema = new mongoose.Schema(
  {
    operatorId:  { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    brandId:     { type: mongoose.Schema.Types.ObjectId, ref: "Brand", default: null },
    name:        { type: String, required: true, trim: true },
    description: { type: String, default: null },

    // Casino bonus-definition type.
    type:        { type: String, enum: ["deposit_bonus", "free_spins", "cashback"], required: true },
    currency:    { type: String, default: "EUR" },
    wageringMultiplier: { type: Number, default: 15 }, // casino enforces a min of 15
    validityDays: { type: Number, default: 30 },        // player redemption window

    // deposit_bonus
    percentAmount:    { type: Number, default: null },  // e.g. 100 = 100% match
    minDepositAmount: { type: Number, default: null },
    maxBonusAmount:   { type: Number, default: null },

    // free_spins
    freeSpinCount:  { type: Number, default: null },
    freeSpinGameId: { type: String, default: null },
    freeSpinValue:  { type: Number, default: null },

    // cashback
    cashbackPercent:   { type: Number, default: null },
    cashbackMaxAmount: { type: Number, default: null },

    // Base code; per-affiliate sub-codes derive from this.
    baseCode: { type: String, required: true, uppercase: true, trim: true },

    status:    { type: String, enum: ["draft", "active", "archived"], default: "draft" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    // Pull model: bonus synced from the casino catalog. externalBonusId is the
    // casino bonus-definition id; distributable = operator opted it in for
    // affiliates. source 'casino' = pulled, 'manual' = defined in Affiliar.
    source:          { type: String, enum: ["manual", "casino"], default: "manual" },
    externalBonusId: { type: String, default: null },
    distributable:   { type: Boolean, default: false },
  },
  { timestamps: true },
);

bonusOfferSchema.index({ operatorId: 1, status: 1 });

module.exports = mongoose.model("BonusOffer", bonusOfferSchema);
