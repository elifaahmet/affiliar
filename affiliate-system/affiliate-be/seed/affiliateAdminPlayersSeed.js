const connectDB = require("../config/db");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const speakeasy = require("speakeasy");
const AffiliateUser = require("../models/AffiliateUser");
const Player = require("../models/Player");
const Wallet = require("../models/Wallet");
const Currency = require("../models/Currency");
const getNextSequence = require("../middlewares/counterAdder");
const { logger } = require("../middlewares/logger");

const AFFILIATE_ADMIN = {
  email: "affiliate.admin@example.com",
  username: "affiliate.admin",
  name: "Affiliate Admin",
  password: "Affiliate123!",
  role: "affiliate",
  affiliateId: 1001,
};

const PLAYERS_TO_CREATE = 10;

const seedAffiliateAdminAndPlayers = async () => {
  try {
    await connectDB();

    const passwordHash = await bcrypt.hash(AFFILIATE_ADMIN.password, 10);

    let admin = await AffiliateUser.findOne({ email: AFFILIATE_ADMIN.email });
    if (!admin) {
      admin = await AffiliateUser.create({
        email: AFFILIATE_ADMIN.email,
        username: AFFILIATE_ADMIN.username,
        name: AFFILIATE_ADMIN.name,
        password: passwordHash,
        role: AFFILIATE_ADMIN.role,
        affiliateId: AFFILIATE_ADMIN.affiliateId,
        status: "active",
        isDeleted: false,
      });
    } else {
      admin.role = AFFILIATE_ADMIN.role;
      admin.affiliateId = AFFILIATE_ADMIN.affiliateId;
      admin.password = passwordHash;
      admin.status = "active";
      admin.isDeleted = false;
      await admin.save();
    }

    await Player.deleteMany({ affiliateAdminUserId: admin._id });

    const gamificationLevelsCol =
      mongoose.connection.db.collection("gamificationLevels");
    const baseLevel = await gamificationLevelsCol.findOne(
      { level: 0, isDeleted: { $ne: true } },
      { projection: { _id: 1 } },
    );
    if (!baseLevel?._id) {
      throw new Error("Base gamification level (level 0) not found");
    }

    const supportedCodes = Array.from(
      new Set(
        (process.env.APP_SUPPORTED_CURRENCIES || "")
          .split(",")
          .map((c) => c.trim().toUpperCase())
          .filter(Boolean),
      ),
    );
    if (!supportedCodes.length) {
      throw new Error("APP_SUPPORTED_CURRENCIES is not set");
    }

    const currencies = await Currency.find(
      { code: { $in: supportedCodes }, isDeleted: { $ne: true } },
      { _id: 1, code: 1, name: 1 },
    ).lean();

    const byCode = new Map(
      currencies.map((c) => [String(c.code).toUpperCase(), c]),
    );
    const missing = supportedCodes.filter((c) => !byCode.has(c));
    if (missing.length) {
      throw new Error(`Missing currencies in DB: ${missing.join(", ")}`);
    }

    const ordered = supportedCodes.map((c) => byCode.get(c));

    const players = [];
    const now = new Date();
    const playerPassword = await bcrypt.hash("123123aA", 10);
    const domain = process.env.BASE_URL || "staging.pixupplay.tech";
    const issuerName = domain.replace(/^https?:\/\//, "");

    for (let i = 0; i < PLAYERS_TO_CREATE; i += 1) {
      const id = await getNextSequence("Players");
      const username = `affiliate_player_${id}`;
      const email = `affiliate_player_${id}@example.com`;
      const secret = speakeasy.generateSecret({ length: 20 });
      const twoFaUrl = `otpauth://totp/${issuerName}:${username}?secret=${secret.base32}&issuer=${issuerName}`;

      const newPlayer = await new Player({
        id,
        email,
        username,
        password: playerPassword,
        acquisitionSourceType: "admin_affiliate",
        affiliateAdminUserId: admin._id,
        referredByPlayerId: null,
        referralCodeUsed: null,
        isActive: true,
        isDeleted: false,
        registerDate: now,
        twoFaSecretBase32: secret.base32,
        twoFaUrl,
        twoFAValidated: false,
        verifyLevel: 0,
        gamificationLevel: baseLevel._id,
        createdAt: now,
        updatedAt: now,
      }).save();

      players.push(newPlayer);

      const walletsToInsert = [];
      for (let j = 0; j < ordered.length; j += 1) {
        const walletSeq = await getNextSequence("Wallet");
        const cur = ordered[j];
        walletsToInsert.push({
          playerId: newPlayer._id,
          id: walletSeq,
          currency: cur._id,
          walletCategory: "Fiat",
          isActive: j === 0,
          title: `${cur.code} Wallet`,
          total: mongoose.Types.Decimal128.fromString("0.00"),
          isDeleted: false,
          createdAt: now,
          updatedAt: now,
        });
      }
      await Wallet.insertMany(walletsToInsert);
    }

    logger.info("seed.affiliate_admin_players.success", {
      adminId: String(admin._id),
      players: players.length,
    });
    process.exit(0);
  } catch (error) {
    logger.error("seed.affiliate_admin_players.failure", { error });
    process.exit(1);
  }
};

seedAffiliateAdminAndPlayers();
