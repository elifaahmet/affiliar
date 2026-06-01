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
