const mongoose = require("mongoose");

const affiliatePlayerSchema = new mongoose.Schema(
  {
    operatorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Operator",
      required: true,
      index: true,
    },
    brandId: {
      type: String,
      default: null,
      index: true,
    },
    playerId: {
      type: String,
      required: true,
    },
    affiliateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    affiliateCode: {
      type: String,
      default: null,
      index: true,
    },
    campaign: {
      type: String,
      default: null,
    },
    subId: {
      type: String,
      default: null,
    },
    country: {
      type: String,
      default: null,
    },
    currency: {
      type: String,
      default: null,
    },
    registeredAt: {
      type: Date,
      default: null,
    },
    source: {
      type: String,
      enum: ["realtime", "bulk", "csv"],
      required: true,
    },
    importedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

// One record per operator + playerId
affiliatePlayerSchema.index({ operatorId: 1, playerId: 1 }, { unique: true });
affiliatePlayerSchema.index({ affiliateCode: 1, registeredAt: -1 });
affiliatePlayerSchema.index({ operatorId: 1, registeredAt: -1 });

module.exports = mongoose.model("AffiliatePlayer", affiliatePlayerSchema);
