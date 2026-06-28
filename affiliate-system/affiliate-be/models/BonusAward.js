const mongoose = require("mongoose");

// One affiliate reaching one campaign's target → one award. Unique per
// (campaign, affiliate) so the job never double-awards. Created pending; the
// operator marks it paid (out of band or alongside a payout).
const bonusAwardSchema = new mongoose.Schema(
  {
    campaignId:  { type: mongoose.Schema.Types.ObjectId, ref: "BonusCampaign", required: true },
    operatorId:  { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    affiliateId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    source:      { type: String, enum: ["target", "direct"], default: "target" },
    metric:      { type: String, default: null },    // target awards only
    value:       { type: Number, default: null },    // metric value at award time
    target:      { type: Number, default: null },
    rewardCents: { type: Number, required: true },
    currency:    { type: String, default: "EUR" },
    achievedAt:  { type: Date, required: true },
    status:      { type: String, enum: ["pending", "paid"], default: "pending" },
    paidAt:      { type: Date, default: null },
    note:        { type: String, default: null },
  },
  { timestamps: true },
);

bonusAwardSchema.index({ campaignId: 1, affiliateId: 1 }, { unique: true });

module.exports = mongoose.model("BonusAward", bonusAwardSchema);
