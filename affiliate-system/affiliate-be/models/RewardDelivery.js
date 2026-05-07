const mongoose = require("mongoose");

/**
 * Outbound webhook delivery queue. One row per HTTP delivery attempt-set
 * (an attempt-set is "first try plus all retries until terminal").
 *
 * Two events feed this queue:
 *   referral.reward.issued    — a referral cleared qualification gates
 *   referral.reward.reversed  — a previously rewarded referral was reversed
 *
 * Both events use the same envelope and signing scheme. The worker
 * (jobs/referralDeliveryWorker.js) polls `status: 'pending'` rows whose
 * `nextAttemptAt` has elapsed, signs the payload, POSTs to the brand's
 * webhook URL, and writes back the result.
 *
 * See docs/refer-a-friend/WEBHOOK.md for the wire contract and retry
 * schedule.
 */
const rewardDeliverySchema = new mongoose.Schema(
  {
    referralId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PlayerReferral",
      required: true,
      index: true,
    },

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

    // Event types this queue carries:
    //   referral.reward.issued           — referrer earned a reward
    //   referral.reward.reversed         — referrer reward clawed back
    //   referral.reward.referee.issued   — referee (friend) welcome bonus
    //   referral.reward.referee.reversed — referee bonus clawed back
    // The same referralId can produce up to four separate delivery rows
    // (one per event/recipient combination).
    eventType: {
      type: String,
      enum: [
        "referral.reward.issued",
        "referral.reward.reversed",
        "referral.reward.referee.issued",
        "referral.reward.referee.reversed",
      ],
      required: true,
      index: true,
    },

    /**
     * Frozen at create time. The exact JSON we'll POST. Storing it here
     * (rather than re-computing per attempt) means every retry sends an
     * identical body, and the dashboard can show operators precisely
     * what was sent.
     */
    payload: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },

    // SHA-256 of the JSON body. Convenience for the operator dashboard
    // ("show me this delivery's content hash") and for cross-checking
    // mid-flight retries with the same body.
    payloadHash: { type: String, required: true },

    /**
     * pending    — queued; worker will pick up at/after `nextAttemptAt`
     * delivered  — operator returned 2xx
     * failed     — exhausted retries OR operator returned a non-retriable 4xx;
     *              terminal until manually replayed (which creates a new row)
     */
    status: {
      type: String,
      enum: ["pending", "delivered", "failed"],
      default: "pending",
      index: true,
    },

    // 0 before first attempt; incremented per HTTP call. Cap at 6
    // (1m / 5m / 30m / 2h / 12h / 24h schedule from WEBHOOK.md §5).
    attempts: { type: Number, default: 0, min: 0 },

    // The earliest UTC time the worker may attempt next. On create, equals
    // `createdAt` (deliver immediately). After each failed attempt, bumped
    // per the retry schedule. Indexed so the worker query is cheap.
    nextAttemptAt: { type: Date, default: () => new Date(), index: true },
    lastAttemptAt: { type: Date, default: null },
    deliveredAt:   { type: Date, default: null },

    /**
     * The latest HTTP response. Overwritten on each attempt; full history
     * lives in `attemptHistory` for the dashboard.
     */
    lastResponse: {
      statusCode:   { type: Number, default: null },
      bodySnippet:  { type: String, default: null },   // first 256 chars
      latencyMs:    { type: Number, default: null },
      errorMessage: { type: String, default: null },   // network/timeout failures
      attemptedAt:  { type: Date, default: null },
    },

    /**
     * Per-attempt audit trail. Capped to last 6 entries (max attempts) so
     * documents never grow unbounded.
     */
    attemptHistory: [
      {
        attemptedAt:  { type: Date, required: true },
        statusCode:   { type: Number, default: null },
        bodySnippet:  { type: String, default: null },
        latencyMs:    { type: Number, default: null },
        errorMessage: { type: String, default: null },
      },
    ],

    // If a manual replay creates a new delivery row, this points back to
    // the original failed delivery for traceability. null on first
    // delivery; set to the prior failed row's _id on replay.
    replayOf: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RewardDelivery",
      default: null,
    },
  },
  { timestamps: true },
);

// Worker query: "next pending delivery whose nextAttemptAt has elapsed,
// across all brands". Compound index makes this an O(log n) scan.
rewardDeliverySchema.index({ status: 1, nextAttemptAt: 1 });

// Dashboard listings ordered by recency, scoped per brand.
rewardDeliverySchema.index({ brandId: 1, createdAt: -1 });

module.exports = mongoose.model("RewardDelivery", rewardDeliverySchema);
