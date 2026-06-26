const mongoose = require("mongoose");

// A marketing asset an operator publishes for its affiliates: a banner (hosted
// image) or a text/email snippet, scoped to one brand. Affiliates grab it from
// the Marketing page and get a ready-to-paste embed with their own tracking
// link baked in. Per-creative performance comes for free via a default
// `campaign=creative-<slug>` tag that flows into the existing campaign reports.
const creativeSchema = new mongoose.Schema(
  {
    operatorId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    brandId:    { type: mongoose.Schema.Types.ObjectId, ref: "Brand", required: true },
    name:       { type: String, required: true, trim: true },
    type:       { type: String, enum: ["banner", "text"], default: "banner" },
    // Banner
    imageUrl:   { type: String, default: null },
    width:      { type: Number, default: null },
    height:     { type: Number, default: null },
    // Optional landing override (absolute URL or path appended to the brand
    // homepage); empty = brand homepage.
    landingPath: { type: String, default: null },
    // Text / email snippet
    body:       { type: String, default: null },
    status:     { type: String, enum: ["active", "archived"], default: "active" },
    createdBy:  { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

creativeSchema.index({ operatorId: 1, brandId: 1, status: 1 });

module.exports = mongoose.model("Creative", creativeSchema);
