const mongoose = require("mongoose");

/**
 * Per-brand configuration for the Refer-a-Friend (player → player) feature.
 * One row per brand. Independent from the affiliate program — modifying or
 * disabling this never affects affiliate commission flows.
 *
 * Lifecycle: a brand without a row is implicitly disabled. Operators create
 * a row via the Settings → Refer-a-Friend tab; toggling `enabled` is the
 * master switch.
 *
 * See docs/refer-a-friend/SPEC.md §3.1 for field semantics.
 */
const referAFriendConfigSchema = new mongoose.Schema(
  {
    brandId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Brand",
      required: true,
      unique: true,
      index: true,
    },

    // Denormalized for fast operator-scoped queries (e.g. "list every brand's
    // refer-a-friend config for this operator"). Always derived from Brand
    // at create time.
    operatorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Operator",
      required: true,
      index: true,
    },

    // Master switch. New track-signup calls on a disabled brand are rejected
    // with 403; in-flight referrals continue to qualify and pay out.
    enabled: {
      type: Boolean,
      default: false,
    },

    /**
     * Referrer reward shape — what the inviter earns when their friend
     * qualifies.
     *   fixed_bonus                — pay `amountCents` regardless of FTD size
     *   percent_of_first_deposit   — pay `percent`% of the referee's FTD,
     *                                capped at `capCents` if set
     */
    reward: {
      type: {
        type: String,
        enum: ["fixed_bonus", "percent_of_first_deposit"],
        default: "fixed_bonus",
      },
      // For fixed_bonus: the payout. Ignored for percent_of_first_deposit.
      amountCents: { type: Number, default: 0, min: 0 },
      // For percent_of_first_deposit: 0-100 percent of FTD.
      percent: { type: Number, default: 0, min: 0, max: 100 },
      // Hard ceiling on percent reward, regardless of FTD size. null = no cap.
      capCents: { type: Number, default: null, min: 0 },
      // Reporting currency. Affiliar normalizes incoming FTDs to this.
      currency: { type: String, default: "EUR" },
      // Hint to the operator's wallet system about how to credit the reward.
      // Affiliar does not interpret this — operator policy decides the
      // mechanics (bonus terms, wager requirements, expiry).
      rewardKind: {
        type: String,
        enum: ["bonus", "cash", "freespins"],
        default: "bonus",
      },
    },

    /**
     * Referee reward — the welcome bonus the invited friend receives at the
     * same time the referrer is paid (Phase 2 two-sided rewards).
     *
     * Backward compatibility: `enabled` defaults to `false`. Existing
     * operators see no behavioral change until they explicitly turn it on
     * and configure an amount. Currency is inherited from `reward.currency`
     * (one currency per brand keeps reporting clean).
     */
    refereeReward: {
      enabled: { type: Boolean, default: false },
      type: {
        type: String,
        enum: ["fixed_bonus", "percent_of_first_deposit"],
        default: "fixed_bonus",
      },
      amountCents: { type: Number, default: 0, min: 0 },
      percent: { type: Number, default: 0, min: 0, max: 100 },
      capCents: { type: Number, default: null, min: 0 },
      rewardKind: {
        type: String,
        enum: ["bonus", "cash", "freespins"],
        default: "bonus",
      },
    },

    /**
     * Recurring referrer reward (Phase 2 Step 4) — operator pays the
     * referrer a % of the friend's monthly base each month, for an
     * optional fixed duration. Lives alongside the one-shot `reward`
     * (operators commonly run both: e.g. "€10 one-shot + 5% of NGR for
     * 6 months").
     *
     * Eligibility: only referrals in `status: 'rewarded'` accrue
     * recurring payments. If the FTD is reversed (`status: 'reversed'`),
     * future months stop; already-paid recurring stays — those were
     * earned on real activity.
     *
     * `ngrMetric` controls the base:
     *   ggr — bets − wins (simplest, least disputable)
     *   ngr — bets − wins − bonuses (simplified; not the same as the
     *         commission engine's NGR which subtracts fees too)
     */
    recurringReward: {
      enabled: { type: Boolean, default: false },
      percent: { type: Number, default: 0, min: 0, max: 100 },
      ngrMetric: {
        type: String,
        enum: ["ngr", "ggr"],
        default: "ngr",
      },
      // null = no time limit (pays forever as long as friend stays active).
      durationMonths: { type: Number, default: null, min: 1 },
      // Per-month payout cap for this referral. null = no cap.
      monthlyCapCents: { type: Number, default: null, min: 0 },
      rewardKind: {
        type: String,
        enum: ["cash", "bonus", "freespins"],
        default: "cash",
      },
    },

    /**
     * Qualification gates. Slim parallel of CommissionPlan.cpa.qualification —
     * shape kept similar so operators familiar with CPA gates land on the
     * same mental model. Compile-time decoupled from cpaQualification.js.
     */
    qualification: {
      // Referee's FTD must clear this. Below = referral rejected outright.
      minDepositCents: { type: Number, default: 0, min: 0 },
      // Wait N days after FTD before evaluating. Gives chargebacks time to
      // surface before paying out the referrer.
      holdDays: { type: Number, default: 7, min: 0 },
      // Flat wager floor: referee must wager at least this much. Either
      // gate (flat or multiple) clears the wager requirement — whichever
      // is higher applies.
      minWagerCents: { type: Number, default: 0, min: 0 },
      // Wager-as-multiple of FTD. e.g. 3 = "must wager 3× the FTD amount".
      minWagerMultiple: { type: Number, default: 0, min: 0 },
    },

    /**
     * Spending caps. Enforced at the `qualified` step — a referral that
     * would push us over a cap is moved to `rejected` with reason
     * `cap_exceeded` instead of paying out.
     */
    caps: {
      // Max one referrer can earn from this brand in a calendar month.
      // 0 = no cap.
      perReferrerMonthlyCents: { type: Number, default: 0, min: 0 },
      // Brand-wide spend cap per calendar month. 0 = no cap.
      perBrandMonthlyCents: { type: Number, default: 0, min: 0 },
    },

    /**
     * Outbound webhook config. Reward emission flows here.
     *
     * `signingSecret` is the HMAC key affiliar uses to sign payloads. It is
     * shown to the operator exactly once at generation time (the dashboard
     * display-once flow); we keep the literal value in the DB so the worker
     * can sign requests. If the deployment uses encrypted-at-rest storage,
     * this is fine; KMS-based encryption is a future upgrade.
     *
     * Disabling `webhook.enabled` parks pending deliveries — the worker
     * skips this brand until re-enabled. No deliveries are dropped.
     */
    webhook: {
      url: { type: String, default: null, trim: true },
      signingSecret: { type: String, default: null },
      enabled: { type: Boolean, default: false },
      // When the secret was last rotated, for auditing.
      secretRotatedAt: { type: Date, default: null },
    },
  },
  { timestamps: true },
);

referAFriendConfigSchema.index({ operatorId: 1, enabled: 1 });

module.exports = mongoose.model("ReferAFriendConfig", referAFriendConfigSchema);
