const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      unique: true,
      required: true,
    },
    id: {
      type: Number,
      unique: true,
      sparse: true,
    },
    username: {
      type: String,
      unique: true,
    },
    name: {
      type: String,
    },
    role: {
      type: String,
      enum: ["affiliate", "operator"],
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive", "pending"],
      default: "active",
    },
    lastLogin: {
      type: Date,
      default: null,
    },
    password: {
      type: String,
    },
    quickAccessShortcuts: {
      type: [
        {
          key: { type: String, required: true },
          order: { type: Number, required: true },
        },
      ],
      default: [],
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    twoFactorEnabled: {
      type: Boolean,
      default: false,
    },
    twoFactorSecret: {
      type: String,
      default: null,
    },
    twoFactorQrScanned: {
      type: Boolean,
      default: false,
    },
    mobileNumber: {
      type: String,
      default: null,
    },
    mobileCountryCode: {
      type: String,
      default: null,
    },
    operatorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Operator",
      default: null,
      index: true,
    },
  },
  { timestamps: true },
);

userSchema.index({ role: 1, isDeleted: 1 });

module.exports = mongoose.model("User", userSchema);
