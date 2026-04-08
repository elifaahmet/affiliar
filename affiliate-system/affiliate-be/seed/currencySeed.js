const connectDB = require("../config/db");
const Currency = require("../models/Currency");
const { logger } = require("../middlewares/logger");

let currencies = [
  {
    id: 1,
    name: "Pounds Sterling",
    code: "GBP",
    symbol: "£",
  },
  {
    id: 21,
    name: "Euros",
    code: "EUR",
    symbol: "€",
  },
  {
    id: 100001,
    name: "US Dollars",
    code: "USD",
    symbol: "$",
  },
  {
    id: 100021,
    name: "IS Bingo Credits",
    code: "ISK",
    symbol: "+",
  },
  {
    id: 100022,
    name: "Kiosk Points",
    code: "KP",
    symbol: "*",
  },
  {
    id: 100042,
    name: "Swedish Kronor",
    code: "SEK",
    symbol: "kr",
  },
  {
    id: 100062,
    name: "Norwegian Krone",
    code: "NOK",
    symbol: "kr",
  },
  {
    id: 100102,
    name: "Polish Zloty",
    code: "PLN",
    symbol: "zł",
  },
  {
    id: 100122,
    name: "Chinese Yuan",
    code: "CNY",
    symbol: "¥",
  },
  {
    id: 100142,
    name: "Nigerian Naira",
    code: "NGN",
    symbol: "₦ ",
  },
  {
    id: 100192,
    name: "EcasinoLoyaltyPoint",
    code: "ELP",
    symbol: "\u003d",
  },
  {
    id: 100292,
    name: "Road Points",
    code: "XRP",
    symbol: "✪",
  },
  {
    id: 100342,
    name: "Hungarian Forint",
    code: "HUF",
    symbol: "Ft",
  },
  {
    id: 100442,
    name: "Japanese Yen",
    code: "JPY",
    symbol: "¥",
  },
  {
    id: 100492,
    name: "South African Rand",
    code: "ZAR",
    symbol: "R",
  },
  {
    id: 100642,
    name: "Indian Rupee",
    code: "INR",
    symbol: "₹",
  },
  {
    id: 100692,
    name: "Bitcoin Core (BTC)",
    code: "BTC",
    symbol: "₿",
  },
  {
    id: 100742,
    name: "Loyalty Tokens",
    code: "LOY",
    symbol: "l#",
  },
  {
    id: 100743,
    name: "Sweepstake Tokens",
    code: "SWP",
    symbol: "s#",
  },
];

connectDB();

currencies = currencies.map((currency) => {
  const { id, ...rest } = currency;
  return rest;
});

const updateCurrencies = async () => {
  const currencies = await Currency.find();
  currencies.forEach(async (currency) => {
    currency.fixedValueCount = 2;
    await currency.save();
  });
};

// Wipe and insert default currencies if collection is empty or refresh is desired
const seedCurrencies = async () => {
  try {
    await Currency.deleteMany({});
    await Currency.insertMany(currencies);
    logger.info("seed.currencies.success", { count: currencies.length });
  } catch (err) {
    logger.error("seed.currencies.failure", { error: err });
  }
};

// Run seeding when invoked directly
if (require.main === module) {
  seedCurrencies();
}

module.exports = { seedCurrencies, updateCurrencies };
