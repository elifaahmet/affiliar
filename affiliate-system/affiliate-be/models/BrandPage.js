const mongoose = require("mongoose");

/**
 * Operator-defined custom pages for a brand (login / register / bonus /
 * anything the operator wants to surface). Free-form: a label, an optional
 * URL, and an optional description. Many per brand.
 *
 * Mirrors the brand-owned sub-resource shape used elsewhere (e.g.
 * ReferAFriendConfig): keeps `brandId` plus a denormalized `operatorId` so
 * list + ownership-scope queries never need a Brand join.
 */
const brandPageSchema = new mongoose.Schema(
  {
    brandId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Brand",
      required: true,
      index: true,
    },
    operatorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Operator",
      required: true,
      index: true,
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
    description: {
      type: String,
      trim: true,
      default: null,
    },
    enabled: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("BrandPage", brandPageSchema);
