const mongoose = require("mongoose");

/**
 * One row per player-to-player referral. Distinct from the affiliate
 * program — `referrerPlayerId` is a player on the operator's side, not
 * an affiliar User.
 *
 * Created by track-signup, advanced by track-ftd / qualification job /
 * track-ftd-reversal. See docs/refer-a-friend/SPEC.md §4 for the
 * lifecycle and §3.2 for the schema rationale.
 */
const playerReferralSchema = new mongoose.Schema(
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

    // The inviter — operator-scoped player id. Free-form string so the
    // operator's player ids can be whatever shape they like.
    referrerPlayerId: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },

    // The friend who signed up. Unique per operator (see compound index
    // below) — a player can only ever be a referee once across an
    // operator's brands.
    refereePlayerId: {
      type: String,
      required: true,
      trim: true,
    },

    // Optional metadata. The operator generates and owns the code; we just
    // record what they pass in for reporting.
    refCode: {
      type: String,
      default: null,
      trim: true,
    },

    /**
     * pending_ftd            — created by track-signup, awaiting first deposit
     * pending_qualification  — track-ftd recorded, waiting on qualification
     *                          gates (hold period, wager threshold, etc.)
     * qualified              — gates cleared, reward computed, delivery enqueued
     * rewarded               — referral.reward.issued delivered + 2xx-acked
     * reversed               — track-ftd-reversal received after `rewarded`;
     *                          referral.reward.reversed delivery fired
     * rejected               — terminal failure: gates couldn't pass, cap hit,
     *                          fraud flag, or FTD reversed before payout
     */
    status: {
      type: String,
      enum: [
        "pending_ftd",
        "pending_qualification",
        "qualified",
        "rewarded",
        "reversed",
        "rejected",
      ],
      default: "pending_ftd",
      index: true,
    },

    // Free-form when status is `rejected`. Common values: 'cap_exceeded',
    // 'min_deposit_not_met', 'wager_floor_not_met', 'ftd_reversed', 'fraud'.
    rejectionReason: { type: String, default: null },

    // Operator admin can freeze a non-terminal referral — qualification job
    // skips it and the recurring payouts pause. Independent of status so
    // the freeze can be lifted later and the referral resumes from
    // wherever it was. `frozenReason`/`frozenAt` give the audit trail.
    frozen:       { type: Boolean, default: false, index: true },
    frozenReason: { type: String,  default: null },
    frozenAt:     { type: Date,    default: null },

    // Timestamps along the lifecycle. Each is set when the corresponding
    // transition occurs and never modified afterward (audit trail).
    signedUpAt: { type: Date, default: null },
    ftdAt:      { type: Date, default: null },
    qualifiedAt:{ type: Date, default: null },
    rewardedAt: { type: Date, default: null },
    reversedAt: { type: Date, default: null },

    // FTD details (set by track-ftd).
    ftdCents:    { type: Number, default: null, min: 0 },
    ftdCurrency: { type: String, default: null },

    // Referrer reward computed at qualification time. Stored even after
    // `rewarded` so the activity tab can show "what we paid".
    rewardCents:    { type: Number, default: null, min: 0 },
    rewardCurrency: { type: String, default: null },

    // Referee reward (Phase 2 two-sided rewards). Null when refereeReward
    // was disabled at qualification time.
    refereeRewardCents:    { type: Number, default: null, min: 0 },
    refereeRewardCurrency: { type: String, default: null },
    // Set when the referee.issued delivery is acked by the operator
    // webhook. Independent of `rewardedAt` (referrer's ack timestamp) —
    // both sides settle on their own pace.
    refereeRewardedAt:     { type: Date, default: null },

    // Reversal details (set by track-ftd-reversal).
    reversedAmountCents: { type: Number, default: null, min: 0 },
    reversalReason:      { type: String, default: null },

    /**
     * Recurring rewards ledger (Phase 2 Step 4). One entry per monthly
     * payout, appended by the recurring job. `paidAt` is set when the
     * delivery worker gets a 2xx — until then the row is "queued".
     *
     * The (year, month) pair is the dedup key — the job won't re-pay
     * a month that's already in this array.
     */
    recurringPayments: [
      {
        year:           { type: Number, required: true },
        month:          { type: Number, required: true, min: 1, max: 12 },
        ngrCents:       { type: Number, required: true, min: 0 },
        rewardCents:    { type: Number, required: true, min: 0 },
        rewardCurrency: { type: String, default: null },
        deliveryId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "RewardDelivery",
          default: null,
        },
        enqueuedAt:     { type: Date, default: Date.now },
        paidAt:         { type: Date, default: null },
      },
    ],

    /**
     * Snapshot of the ReferAFriendConfig at the moment of qualification.
     * Captures the reward shape + gates as they were then, so historical
     * referrals stay valid even if the operator later changes config.
     */
    configSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  { timestamps: true },
);

// Hard uniqueness: a player can be a referee on at most one of an
// operator's brands, ever. This is the duplicate-referee gate.
playerReferralSchema.index(
  { operatorId: 1, refereePlayerId: 1 },
  { unique: true },
);

// Activity report queries: "show all referrals for this brand by status"
playerReferralSchema.index({ brandId: 1, status: 1, createdAt: -1 });

// Operator-wide views (e.g. "every refer-a-friend referral, all brands")
playerReferralSchema.index({ operatorId: 1, status: 1, createdAt: -1 });

// "Referrals owned by this player" — used by the qualification job and
// future Phase 2 player-facing endpoints.
playerReferralSchema.index({ operatorId: 1, referrerPlayerId: 1, createdAt: -1 });

module.exports = mongoose.model("PlayerReferral", playerReferralSchema);
