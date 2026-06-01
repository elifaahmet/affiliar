const mongoose = require("mongoose");

const brandSchema = new mongoose.Schema(
  {
    id: {
      type: Number,
      unique: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    url: {
      type: String,
      trim: true,
      default: null,
    },
    enabled: {
      type: Boolean,
      default: true,
    },
    // Which products the brand actually offers. Casino-only brands won't
    // see Sportsbook columns/tiles in reports; an empty list would imply
    // "neither", so the default mirrors the legacy fully-featured brand.
    products: {
      type: [String],
      enum: ["casino", "sportsbook"],
      default: ["casino", "sportsbook"],
    },
    // References Operator._id directly (not the owner User). This avoids the
    // historical multi-owner bug where the brand attached to whichever user
    // happened to create it — second owners of the operator couldn't see it.
    operatorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Operator",
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Brand", brandSchema);
