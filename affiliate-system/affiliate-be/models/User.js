const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      unique: true,
      required: true,
    },
    id: {
      type: Number,
      unique: true,
      sparse: true,
    },
    username: {
      type: String,
      unique: true,
    },
    name: {
      type: String,
    },
    role: {
      type: String,
      enum: ["affiliate", "operator"],
      required: true,
    },
    // Hexium-internal flag: when true, the user can access /platform admin
    // routes (create operators, etc.) on top of whatever their `role` lets
    // them do. Orthogonal to role so a regular operator account can also
    // hold this flag without losing their normal operator privileges.
    isPlatformAdmin: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ["active", "inactive", "pending"],
      default: "active",
    },
    lastLogin: {
      type: Date,
      default: null,
    },
    password: {
      type: String,
    },
    // Email delivery of in-app notifications. `emailNotifications` is the
    // master switch (off = no emails at all). `notificationPrefs` is a
    // per-type override map (key = notification type, value = email on/off);
    // an absent key defaults to on. In-app notifications are always created.
    emailNotifications: {
      type: Boolean,
      default: true,
    },
    notificationPrefs: {
      type: Map,
      of: Boolean,
      default: {},
    },
    // Cadence for the emailed report digest (operators + affiliates). "weekly"
    // = Monday pulse, "monthly" = 1st-of-month summary incl. commission, "off"
    // = no digest. Gated further by emailNotifications (master switch).
    digestFrequency: {
      type: String,
      enum: ["weekly", "monthly", "off"],
      default: "weekly",
    },

    quickAccessShortcuts: {
      type: [
        {
          key: { type: String, required: true },
          order: { type: Number, required: true },
        },
      ],
      default: [],
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    twoFactorEnabled: {
      type: Boolean,
      default: false,
    },
    twoFactorSecret: {
      type: String,
      default: null,
    },
    twoFactorQrScanned: {
      type: Boolean,
      default: false,
    },
    mobileNumber: {
      type: String,
      default: null,
    },
    mobileCountryCode: {
      type: String,
      default: null,
    },
    // Affiliate's own website / promotion URL, self-editable from their
    // profile. Free-form (affiliates may enter a domain or full URL).
    website: {
      type: String,
      default: null,
      trim: true,
    },
    operatorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Operator",
      default: null,
      index: true,
    },

    // Brand-scoping for operator-role users. EMPTY = full operator access
    // (owner-level) — the historical behaviour every existing operator user
    // keeps. NON-EMPTY = the user is restricted to exactly these brands:
    // reports/affiliates are filtered to them and owner-only sections
    // (payouts, commission, fees, brands, team) are blocked. Brands must
    // belong to the user's operator. Ignored for affiliates.
    brandIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Brand" }],
      default: [],
    },

    // ── Affiliate payout wallet ──────────────────────────────────────────────
    //
    // Only meaningful when role === "affiliate". The operator's payout flow
    // dispatches USDT-TRC20 transfers via Coinflux to this address.
    // Captured here (not on AffiliateProfile) so that any auth/identity layer
    // changes won't strand the wallet — payout is a fundamental account
    // property, like an email.
    //
    // Network is enumerated even though we only support TRC20 today, so the
    // schema doesn't fight us when we add ERC20/BEP20 later.
    payoutAddress: {
      type: String,
      default: null,
      trim: true,
    },
    payoutNetwork: {
      type: String,
      enum: ["TRC20"],
      default: "TRC20",
    },
    // Last time the affiliate confirmed / updated the address. We snapshot
    // this onto each AffiliatePayout row so historical payouts remember which
    // address they used even if the affiliate edits later.
    payoutAddressSetAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

userSchema.index({ role: 1, isDeleted: 1 });

module.exports = mongoose.model("User", userSchema);
