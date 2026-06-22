const mongoose = require("mongoose");

// One row per outbound postback we owe an affiliate. Enqueued by the raw
// Kafka consumer when a conversion (registration / ftd / deposit) lands for an
// affiliate that has postback enabled; delivered asynchronously by
// jobs/postbackDeliveryJob.js (HTTP GET to the affiliate's URL template with
// the macros below filled in). Kept as an audit log after delivery.
const postbackDeliverySchema = new mongoose.Schema(
  {
    operatorId:    { type: mongoose.Schema.Types.ObjectId, ref: "Operator", index: true },
    affiliateId:   { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    affiliateCode: { type: String, default: null },

    // Conversion context — used to fill the URL macros.
    event:      { type: String, enum: ["registration", "ftd", "deposit"], required: true },
    playerId:   { type: String, default: null },
    clickId:    { type: String, default: null }, // = the subId carried on the affiliate's link
    amountCents:{ type: Number, default: 0 },
    currency:   { type: String, default: null },
    brandId:    { type: String, default: null },
    occurredAt: { type: Date, default: Date.now },

    // URL template snapshotted at enqueue time so editing the profile later
    // doesn't retro-change pending/sent rows.
    urlTemplate: { type: String, required: true },

    status:      { type: String, enum: ["pending", "sent", "failed"], default: "pending", index: true },
    attempts:    { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 5 },
    nextAttemptAt: { type: Date, default: Date.now, index: true },

    // Delivery result (last attempt).
    finalUrl:       { type: String, default: null },
    responseStatus: { type: Number, default: null },
    lastError:      { type: String, default: null },
    sentAt:         { type: Date, default: null },
  },
  { timestamps: true },
);

// Delivery job scan: pending rows whose retry time has come, oldest first.
postbackDeliverySchema.index({ status: 1, nextAttemptAt: 1 });
// Affiliate's "recent postbacks" view.
postbackDeliverySchema.index({ affiliateId: 1, createdAt: -1 });

module.exports = mongoose.model("PostbackDelivery", postbackDeliverySchema);
