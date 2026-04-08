const connectDB = require("../config/db");
const BonusType = require("../models/BonusType");
const BonusDefinition = require("../models/BonusDefinition");
const Currency = require("../models/Currency");
const { logger } = require("../middlewares/logger");

const now = new Date();
const nextQuarter = new Date(now);
nextQuarter.setMonth(now.getMonth() + 3);

const bonusTypes = [
  { label: "Welcome Bonus", value: "registration_bonus", color: "#3B82F6" },
  { label: "Free Spin Bonus", value: "free_spins", color: "#F97316" },
  { label: "Deposit Bonus", value: "deposit_bonus", color: "#22C55E" },
  { label: "VIP Bonus", value: "vip_bonus", color: "#A855F7" },
  { label: "Cashback Bonus", value: "cashback", color: "#EAB308" },
];

const bonusDefinitions = [
  {
    name: "Welcome Deposit Boost",
    description:
      "Award new players with a flat welcome bonus on their first qualifying deposit.",
    terms:
      "Bonus credited automatically. Standard wagering applies within 72 hours.",
    currencyCode: "USD",
    amount: 100,
    min_deposit_amount: 20,
    bonus_duration_in_hours: 72,
    wagering_multiplier: 25,
    max_convertible_amount: 500,
    max_uses_per_player: 1,
    start_date: now,
    end_date: nextQuarter,
    type: "deposit_bonus",
    payment_methods: ["card", "wallet"],
  },
  {
    name: "Weekly Reload Bonus",
    description:
      "Recurring reload bonus available every week for selected VIP players.",
    terms:
      "50% of deposit credited as bonus. Weekly usage limited to four times per player.",
    currencyCode: "EUR",
    percent_amount: 50,
    max_bonus_amount: 200,
    min_deposit_amount: 25,
    bonus_duration_in_hours: 48,
    wagering_multiplier: 20,
    max_uses_per_player: 4,
    vip_level_min: 3,
    start_date: now,
    end_date: nextQuarter,
    type: "deposit_bonus",
    payment_methods: ["card"],
  },
];

const seed = async () => {
  try {
    await connectDB();

    await BonusType.deleteMany({});
    await BonusType.insertMany(bonusTypes);
    logger.info("seed.bonus_types.insert_success", { count: bonusTypes.length });

    const currencyCodes = [...new Set(bonusDefinitions.map((b) => b.currencyCode))];
    const currencies = await Currency.find({ code: { $in: currencyCodes } }).lean();
    const currencyMap = currencies.reduce((acc, currency) => {
      acc[currency.code] = currency._id;
      return acc;
    }, {});

    const docs = bonusDefinitions.map((definition) => {
      const currencyId = currencyMap[definition.currencyCode];
      if (!currencyId) {
        throw new Error(
          `Missing currency for code ${definition.currencyCode}; seed currencies first`
        );
      }

      const { currencyCode, ...rest } = definition;

      return {
        ...rest,
        currency: currencyId,
      };
    });

    await BonusDefinition.deleteMany({});
    await BonusDefinition.insertMany(docs);
    logger.info("seed.bonus_definitions.insert_success", { count: docs.length });

    process.exit(0);
  } catch (err) {
    logger.error("seed.bonus_types.error", { error: err });
    process.exit(1);
  }
};

if (require.main === module) {
  seed();
}

module.exports = seed;
