const mongoose = require("mongoose");

// In-app notification for a single recipient (operator or affiliate user).
// Emitted on key events (payout paid, commission approved, new signup, fraud
// flagged, billing past-due, …) via utils/notify.js. Rendered in the header
// bell. Cheap, append-only; read state flips in place.
const notificationSchema = new mongoose.Schema(
  {
    userId:     { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    operatorId: { type: mongoose.Schema.Types.ObjectId, ref: "Operator", default: null },
    type:       { type: String, required: true }, // payout_paid | commission_approved | new_affiliate | fraud_flagged | ...
    title:      { type: String, required: true },
    body:       { type: String, default: null },
    link:       { type: String, default: null }, // in-app route to open on click
    read:       { type: Boolean, default: false, index: true },
    readAt:     { type: Date, default: null },
  },
  { timestamps: true },
);

// Bell query: a user's notifications, newest first.
notificationSchema.index({ userId: 1, createdAt: -1 });
// Unread badge count.
notificationSchema.index({ userId: 1, read: 1 });

module.exports = mongoose.model("Notification", notificationSchema);
