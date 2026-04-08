const connectDB = require("../config/db");
const Affiliate = require("../models/Affiliate");
const Player = require("../models/Player");
const { logger } = require("../middlewares/logger");

const seedAffiliatePlayers = async () => {
  const players = await Player.aggregate([
    { $match: { isActive: true, isDeleted: false } },
    { $sample: { size: 2 } },
  ]);

  if (players.length < 2) {
    throw new Error("Not enough active players to seed affiliates");
  }

  return players;
};

const seedAffiliates = async () => {
  try {
    await connectDB();

    const [parentPlayer, childPlayer] = await seedAffiliatePlayers();

    await Affiliate.deleteMany({});

    const parentAffiliate = {
      affiliateId: 1001,
      userId: parentPlayer._id,
      parentAffiliateId: null,
      status: 0,
    };

    const childAffiliate = {
      affiliateId: 1002,
      userId: childPlayer._id,
      parentAffiliateId: 1001,
      status: 0,
    };

    await Affiliate.insertMany([parentAffiliate, childAffiliate]);

    logger.info("seed.affiliates.success");
    process.exit(0);
  } catch (error) {
    logger.error("seed.affiliates.failure", { error });
    process.exit(1);
  }
};

seedAffiliates();
