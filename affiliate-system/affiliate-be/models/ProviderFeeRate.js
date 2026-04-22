const mongoose = require("mongoose");

// Provider-level revenue share that the operator pays out of GGR. Stored
// per (operator, provider) so different providers can have different cuts.
//
// Example: {operatorId: "...", providerId: "coco-gamings", feePercent: 10}
// means the daily fees job books 10% of that provider's GGR as
// game_provider_fees, reducing NGR by that amount.
const providerFeeRateSchema = new mongoose.Schema(
  {
    operatorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Operator",
      required: true,
      index: true,
    },
    providerId: {
      type: String,
      required: true,
      trim: true,
    },
    providerName: { type: String, default: "" },
    feePercent: { type: Number, required: true, min: 0, max: 100 },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true },
);

providerFeeRateSchema.index(
  { operatorId: 1, providerId: 1 },
  { unique: true },
);

module.exports = mongoose.model("ProviderFeeRate", providerFeeRateSchema);
