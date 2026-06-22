const mongoose = require("mongoose");

const affiliatePlayerSchema = new mongoose.Schema(
  {
    operatorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Operator",
      required: true,
      index: true,
    },
    brandId: {
      type: String,
      default: null,
      index: true,
    },
    playerId: {
      type: String,
      required: true,
    },
    affiliateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    affiliateCode: {
      type: String,
      default: null,
      index: true,
    },
    campaign: {
      type: String,
      default: null,
    },
    subId: {
      type: String,
      default: null,
    },
    // The affiliate's OWN reference for this player on their side. Auto-seeded
    // from subId at click time; can also be set/overridden later by the
    // affiliate (PATCH /affiliate-portal/players/:playerId/ref) when they
    // couldn't pass a sub on the link. Lets them reconcile our player_id with
    // their internal id without us storing operator player ids on their behalf.
    externalRef: {
      type: String,
      default: null,
      trim: true,
    },
    country: {
      type: String,
      default: null,
    },
    currency: {
      type: String,
      default: null,
    },
    registeredAt: {
      type: Date,
      default: null,
    },
    // Latest known KYC level for this player. 0 = unverified, 1 = basic,
    // 2 = intermediate, 3 = full. Updated by the player.kyc.updated event
    // (last-write-wins keyed on kycLevelUpdatedAt). Read by the CPA
    // qualification engine to evaluate the minKycLevel gate.
    kycLevel: {
      type: Number,
      default: 0,
      min: 0,
      max: 3,
    },
    kycLevelUpdatedAt: {
      type: Date,
      default: null,
    },
    // Persists the latest player.flagged signal so refer-a-friend
    // qualification can fail-fast without scanning the raw event log.
    // `fraudFlagged` is true whenever the most recent flag was anything
    // other than "active" (e.g. duplicate, disabled, self_excluded,
    // unverified). The original flag string is kept on `lastFraudFlag`
    // so admins can see why.
    fraudFlagged: {
      type: Boolean,
      default: false,
      index: true,
    },
    lastFraudFlag: {
      type: String,
      default: null,
    },
    lastFraudFlagAt: {
      type: Date,
      default: null,
    },

    // Anti-abuse fingerprints — hashed by the operator (we never see raw
    // IP / device / wallet). Used by the refer-a-friend track-signup
    // collision check when the brand opts into blockSameSignals.
    // Updated on player.registered + on every subsequent deposit/login
    // event that carries the field; null means we never received one.
    ipHash:     { type: String, default: null, index: true },
    deviceHash: { type: String, default: null, index: true },
    walletHash: { type: String, default: null, index: true },
    source: {
      type: String,
      enum: ["realtime", "bulk", "csv"],
      required: true,
    },
    importedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

// One record per operator + playerId
affiliatePlayerSchema.index({ operatorId: 1, playerId: 1 }, { unique: true });
affiliatePlayerSchema.index({ affiliateCode: 1, registeredAt: -1 });
affiliatePlayerSchema.index({ operatorId: 1, registeredAt: -1 });

module.exports = mongoose.model("AffiliatePlayer", affiliatePlayerSchema);
