const mongoose = require("mongoose");

const operatorSchema = new mongoose.Schema(
  {
    id: {
      type: Number,
      unique: true,
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    brands: {
      type: [
        {
          id: { type: Number, required: true },
          name: { type: String, required: true, trim: true },
        },
      ],
      default: [],
    },
    plan: {
      type: String,
      enum: ["starter", "growth", "scale"],
      default: "starter",
    },
    billingStatus: {
      type: String,
      enum: ["trial", "active", "past_due", "cancelled"],
      default: "trial",
    },
    billingCycle: {
      type: Date,
      default: null,
    },
    nextBillingDate: {
      type: Date,
      default: null,
    },
    trialEndsAt: {
      type: Date,
      default: () => new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Operator", operatorSchema);
