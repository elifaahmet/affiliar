const mongoose = require("mongoose");

const referralCodeSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    affiliateUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    label: {
      type: String,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    clickCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

referralCodeSchema.index({ affiliateUserId: 1, isActive: 1 });
referralCodeSchema.index({ affiliateUserId: 1, createdAt: -1 });

module.exports = mongoose.model("ReferralCode", referralCodeSchema);
