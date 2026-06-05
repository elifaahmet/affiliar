const mongoose = require("mongoose");

/**
 * A tracking link an affiliate built + saved in the Marketing Tools "link
 * builder". The affiliate picks an operator-defined brand page (or the brand
 * homepage), optionally adds campaign/sub/custom params, and saves it so they
 * can re-copy it later. The canonical `url` is (re)built server-side from the
 * components so it can't be tampered with from the client.
 *
 * Scoped to the affiliate (affiliateUserId) with a denormalized operatorId,
 * mirroring the brand-owned sub-resource shape used elsewhere.
 */
const customParamSchema = new mongoose.Schema(
  {
    key: { type: String, trim: true },
    value: { type: String, trim: true },
  },
  { _id: false },
);

const affiliateBuiltLinkSchema = new mongoose.Schema(
  {
    affiliateUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    operatorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Operator",
      required: true,
      index: true,
    },
    brandId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Brand",
      required: true,
    },
    // The page this link points at; null when it targets the brand homepage.
    pageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BrandPage",
      default: null,
    },
    code: { type: String, required: true },
    label: { type: String, trim: true, default: null },
    targetUrl: { type: String, trim: true, default: null },
    url: { type: String, required: true },
    campaign: { type: String, trim: true, default: null },
    sub: { type: String, trim: true, default: null },
    customParams: { type: [customParamSchema], default: [] },
  },
  { timestamps: true },
);

module.exports = mongoose.model("AffiliateBuiltLink", affiliateBuiltLinkSchema);
