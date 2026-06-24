const mongoose = require("mongoose");

// One row per click on an affiliate's tracking link (smartlink). Written by the
// public redirect endpoint (GET /r/:code) right before the 302 to the brand.
// Feeds the top of the funnel (clicks → registrations → FTD) and conversion
// rates. Registrations/FTD continue to come from ClickHouse activity; clicks
// live here and are joined by affiliate + campaign + date for the funnel view.
const clickSchema = new mongoose.Schema(
  {
    clickId:       { type: String, required: true, unique: true, index: true },
    operatorId:    { type: mongoose.Schema.Types.ObjectId, ref: "Operator", index: true },
    affiliateId:   { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    affiliateCode: { type: String, required: true, index: true },
    brandId:       { type: mongoose.Schema.Types.ObjectId, ref: "Brand", default: null, index: true },

    // Affiliate-supplied tracking params carried through the redirect.
    campaign: { type: String, default: null },
    sub:      { type: String, default: null },

    // Best-effort click context.
    ip:        { type: String, default: null },
    userAgent: { type: String, default: null },
    country:   { type: String, default: null },
    targetUrl: { type: String, default: null }, // where we 302'd them

    // Bot/crawler/prefetch hit (matched a known bot UA or had none). Still
    // recorded + still redirected, but excluded from funnel counts so CR isn't
    // inflated by link-preview bots and scanners.
    isBot:     { type: Boolean, default: false, index: true },

    // Set when this click is later tied to a registration (Phase 2: exact
    // match via click_id echoed back by the casino; today it stays false and
    // the funnel uses aggregate counts).
    converted:        { type: Boolean, default: false, index: true },
    convertedPlayerId:{ type: String, default: null },
    convertedAt:      { type: Date, default: null },
  },
  { timestamps: true },
);

// Funnel/report scans: an affiliate's clicks over a window, grouped by campaign.
clickSchema.index({ affiliateId: 1, createdAt: -1 });
clickSchema.index({ affiliateCode: 1, createdAt: -1 });

module.exports = mongoose.model("Click", clickSchema);
