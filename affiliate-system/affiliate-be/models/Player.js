const mongoose = require("mongoose");

const REFERRAL_CODE_REGEX = /^[A-Z0-9]{5,32}$/;

const playerSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
    },
    id: {
      type: Number,
      unique: true,
    },
    lastLogin: {
      type: Date,
      default: new Date(),
    },
    preferences: {
      ghostMode: {
        type: Boolean,
        default: false,
      },
      hideStatistics: {
        type: Boolean,
        default: false,
      },
      hideAllRaceStatistics: {
        type: Boolean,
        default: false,
      },
      excludeFromRain: {
        type: Boolean,
        default: false,
      },
      receiveEmailOffers: {
        type: Boolean,
        default: false,
      },
      receiveSmsOffers: {
        type: Boolean,
        default: false,
      },
    },
    addressLine: {
      type: String,
    },
    registerDate: {
      type: Date,
    },
    postalCode: {
      type: String,
    },
    brand: {
      type: String,
      default: "",
    },
    encryptedKey: {
      type: String,
      default: "1111",
    },
    expiryDate: {
      type: Date,
    },
    attemptsLeft: {
      type: Number,
    },
    twoFaSecretBase32: {
      type: String,
    },
    twoFaUrl: {
      type: String,
    },
    twoFAValidated: {
      type: Boolean,
    },
    twoFAEnabled: {
      signIn: {
        type: Boolean,
        default: false,
      },
      withdrawal: {
        type: Boolean,
        default: false,
      },
    },
    verifyLevel: {
      type: Number,
      default: 0,
    },
    verify1: {
      firstname: {
        type: String,
        default: null,
      },
      surname: {
        type: String,
        default: null,
      },
      countryId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Country",
      },
      languageId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Language",
      },
      countryName: {
        type: String,
        default: null,
      },
      placeOfBirth: {
        type: String,
        default: null,
      },
      birthDate: {
        type: Date,
        default: null,
      },
      residentialAddress: {
        type: String,
        default: null,
      },
      cityId: {
        type: String,
        default: null,
      },
      occupationIndustry: {
        type: String,
        default: null,
      },
      occupation: {
        type: String,
        default: null,
      },
      mobileCountryCode: {
        type: String,
        default: null,
      },
      mobileNumber: {
        type: String,
        default: null,
      },
    },
    isAadhaarLinked: {
      type: Boolean,
      default: false,
    },
    isAadhaarVerified: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: false,
    },
    confirmationCode: {
      type: String,
      default: "",
    },
    acceptedTerms: {
      type: Boolean,
      default: false,
    },
    soundNotification: {
      type: Boolean,
      default: true,
    },
    excludedFromRevenue: {
      type: Boolean,
      default: false,
    },
    addressLine2: {
      type: String,
    },
    marketingCodeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MarketingCode",
    },
    revenueId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Revenue",
    },
    password: {
      type: String,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    gamificationLevel: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "gamificationLevels",
    },
    stepProcess: {
      type: Number,
      default: 0,
    },
    isBlocked: {
      type: Boolean,
      default: false,
    },
    blockedAt: {
      type: Date,
      default: null,
    },
    blockedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    blockReason: {
      type: String,
      default: null,
    },
    acquisitionSourceType: {
      type: String,
      enum: ["admin_affiliate", "player_referral", null],
      default: null,
    },
    affiliateAdminUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    referralCode: {
      type: String,
      uppercase: true,
      trim: true,
      minlength: 5,
      maxlength: 32,
      match: REFERRAL_CODE_REGEX,
      default: null,
    },
    isReferralCodeActive: {
      type: Boolean,
      default: false,
    },
    referralCodeCreatedAt: {
      type: Date,
      default: null,
    },
    referredByPlayerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Player",
      default: null,
    },
    referralCodeUsed: {
      type: String,
      default: null,
      uppercase: true,
      trim: true,
      minlength: 5,
      maxlength: 32,
      match: REFERRAL_CODE_REGEX,
    },
    referralRewardPercent: {
      type: Number,
      default: null,
      min: 0,
      max: 100,
    },
  },
  { timestamps: true },
);

// Common filters/sorts for player listing
playerSchema.index({ isDeleted: 1, isActive: 1, createdAt: -1 });
playerSchema.index({ lastLogin: -1 });
playerSchema.index({ verifyLevel: 1 });
playerSchema.index({ isBlocked: 1 });
playerSchema.index({ "verify1.countryName": 1 });
playerSchema.index({ "verify1.cityId": 1 });
playerSchema.index({ "verify1.birthDate": 1 });
playerSchema.index({ username: 1 });
playerSchema.index({ email: 1 });

// Referral / acquisition indexes
playerSchema.index({ acquisitionSourceType: 1 });
playerSchema.index({ affiliateAdminUserId: 1 });
playerSchema.index({ referredByPlayerId: 1 });
playerSchema.index({ referredByPlayerId: 1, createdAt: -1 });
playerSchema.index(
  { referralCode: 1 },
  {
    unique: true,
    partialFilterExpression: {
      referralCode: { $type: "string" },
    },
  },
);
playerSchema.index({ referralCodeUsed: 1 });
playerSchema.index({ isReferralCodeActive: 1 });
playerSchema.index({ isReferralCodeActive: 1, referralCode: 1 });
playerSchema.index({ affiliateAdminUserId: 1, createdAt: -1 });

// Normalize referral fields before validation
playerSchema.pre("validate", function (next) {
  if (this.referralCode) {
    this.referralCode = this.referralCode.trim().toUpperCase();
  }

  if (this.referralCodeUsed) {
    this.referralCodeUsed = this.referralCodeUsed.trim().toUpperCase();
  }

  next();
});

// Validate acquisition flow consistency
playerSchema.pre("validate", function (next) {
  const isAdminAffiliate = this.acquisitionSourceType === "admin_affiliate";
  const isPlayerReferral = this.acquisitionSourceType === "player_referral";

  if (!this.acquisitionSourceType) {
    if (this.affiliateAdminUserId) {
      return next(
        new Error(
          "affiliateAdminUserId cannot be set when acquisitionSourceType is null",
        ),
      );
    }

    if (this.referredByPlayerId || this.referralCodeUsed) {
      return next(
        new Error(
          "Referral ownership fields cannot be set when acquisitionSourceType is null",
        ),
      );
    }
  }

  if (isAdminAffiliate) {
    if (!this.affiliateAdminUserId) {
      return next(
        new Error(
          "Player with admin_affiliate source must have affiliateAdminUserId",
        ),
      );
    }

    if (this.referredByPlayerId) {
      return next(
        new Error(
          "Player with admin_affiliate source cannot have referredByPlayerId",
        ),
      );
    }

    if (this.referralCodeUsed) {
      return next(
        new Error(
          "Player with admin_affiliate source cannot have referralCodeUsed",
        ),
      );
    }
  }

  if (isPlayerReferral) {
    if (this.affiliateAdminUserId) {
      return next(
        new Error(
          "Player with player_referral source cannot have affiliateAdminUserId",
        ),
      );
    }

    if (!this.referredByPlayerId) {
      return next(
        new Error(
          "Player with player_referral source must have referredByPlayerId",
        ),
      );
    }

    if (!this.referralCodeUsed) {
      return next(
        new Error(
          "Player with player_referral source must have referralCodeUsed",
        ),
      );
    }

  }

  if (
    this.referredByPlayerId &&
    this._id &&
    this.referredByPlayerId.toString() === this._id.toString()
  ) {
    return next(new Error("Player cannot refer themselves"));
  }

  if (this.referralRewardPercent != null) {
    if (
      typeof this.referralRewardPercent !== "number" ||
      this.referralRewardPercent < 0 ||
      this.referralRewardPercent > 100
    ) {
      return next(
        new Error("referralRewardPercent must be a number between 0 and 100"),
      );
    }
  }

  next();
});


module.exports = mongoose.model("Player", playerSchema);
