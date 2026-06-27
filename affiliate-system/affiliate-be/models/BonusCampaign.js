const mongoose = require("mongoose");

// A time-boxed performance incentive an operator offers its affiliates:
// "hit <target> <metric> between <start> and <end> → earn <reward>". Progress
// is measured live from ClickHouse; awards are granted by the bonus job once an
// affiliate crosses the target. See BonusAward.
const bonusCampaignSchema = new mongoose.Schema(
  {
    operatorId:  { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    brandId:     { type: mongoose.Schema.Types.ObjectId, ref: "Brand", default: null }, // null = all brands
    name:        { type: String, required: true, trim: true },
    description: { type: String, default: null },
    // What to measure. Money metrics store target in cents.
    metric:      { type: String, enum: ["ftd", "ngr", "deposits", "ggr", "registrations"], required: true },
    target:      { type: Number, required: true },         // ftd/registrations = count; money = cents
    rewardCents: { type: Number, required: true },         // bonus paid when target reached
    currency:    { type: String, default: "EUR" },
    startDate:   { type: Date, required: true },
    endDate:     { type: Date, required: true },
    status:      { type: String, enum: ["active", "archived"], default: "active" },
    createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

bonusCampaignSchema.index({ operatorId: 1, status: 1, endDate: 1 });

module.exports = mongoose.model("BonusCampaign", bonusCampaignSchema);
