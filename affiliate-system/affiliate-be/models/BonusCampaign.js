const mongoose = require("mongoose");

// A time-boxed performance incentive an operator offers its affiliates:
// "hit <target> <metric> between <start> and <end> → earn <reward>". Progress
// is measured live from ClickHouse; awards are granted by the bonus job once an
// affiliate crosses the target. See BonusAward.
const bonusCampaignSchema = new mongoose.Schema(
  {
    operatorId:  { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    // target = race (auto-award whoever crosses the metric target in the window);
    // direct = grant the reward straight to selected affiliates, no contest.
    kind:        { type: String, enum: ["target", "direct"], default: "target" },
    brandId:     { type: mongoose.Schema.Types.ObjectId, ref: "Brand", default: null }, // null = all brands
    name:        { type: String, required: true, trim: true },
    description: { type: String, default: null },
    // Target-kind only. Money metrics store target in cents.
    metric:      { type: String, enum: ["ftd", "ngr", "deposits", "ggr", "registrations"], default: null },
    target:      { type: Number, default: null },          // ftd/registrations = count; money = cents
    rewardCents: { type: Number, required: true },         // bonus amount
    currency:    { type: String, default: "EUR" },
    startDate:   { type: Date, default: null },
    endDate:     { type: Date, default: null },
    status:      { type: String, enum: ["active", "archived"], default: "active" },
    createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

bonusCampaignSchema.index({ operatorId: 1, status: 1, endDate: 1 });

module.exports = mongoose.model("BonusCampaign", bonusCampaignSchema);
