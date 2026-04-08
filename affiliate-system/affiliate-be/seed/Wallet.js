const connectDB = require("../config/db");
const Wallet = require("../models/Wallet");
const { logger } = require("../middlewares/logger");

let wallets = [
  {
    playerId: "60f7f8571d789c7a8bd885c7",
    currency: {
      symbol: "$",
      shortCut: "USD",
      fixedValueCount: 2,
    },
    total: 500.0,
    isDeleted: false,
  },
  {
    playerId: "60f7f8571d789c7a8bd885c8",
    currency: {
      symbol: "€",
      shortCut: "EUR",
      fixedValueCount: 2,
    },
    total: 1000.0,
    isDeleted: false,
  },
  {
    playerId: "60f7f8571d789c7a8bd885c9",
    currency: {
      symbol: "¥",
      shortCut: "JPY",
      fixedValueCount: 0,
    },
    total: 20000.0,
    isDeleted: false,
  },
  {
    playerId: "60f7f8571d789c7a8bd885ca",
    currency: {
      symbol: "£",
      shortCut: "GBP",
      fixedValueCount: 2,
    },
    total: 750.0,
    isDeleted: false,
  },
  {
    playerId: "60f7f8571d789c7a8bd885cb",
    currency: {
      symbol: "A$",
      shortCut: "AUD",
      fixedValueCount: 2,
    },
    total: 1200.0,
    isDeleted: false,
  },
  {
    playerId: "60f7f8571d789c7a8bd885cc",
    currency: {
      symbol: "C$",
      shortCut: "CAD",
      fixedValueCount: 2,
    },
    total: 900.0,
    isDeleted: false,
  },
  {
    playerId: "60f7f8571d789c7a8bd885cd",
    currency: {
      symbol: "CHF",
      shortCut: "CHF",
      fixedValueCount: 2,
    },
    total: 800.0,
    isDeleted: false,
  },
  {
    playerId: "60f7f8571d789c7a8bd885ce",
    currency: {
      symbol: "¥",
      shortCut: "CNY",
      fixedValueCount: 2,
    },
    total: 1500.0,
    isDeleted: false,
  },
  {
    playerId: "60f7f8571d789c7a8bd885cf",
    currency: {
      symbol: "s#",
      shortCut: "SWP",
      fixedValueCount: 4,
    },
    total: 600.0,
    isDeleted: false,
  },
  {
    playerId: "60f7f8571d789c7a8bd885d0",
    currency: {
      symbol: "$",
      shortCut: "USD",
      fixedValueCount: 2,
    },
    total: 1100.0,
    isDeleted: false,
  },
];
//pipeline test
connectDB();

// Delete all wallets
Wallet.deleteMany({})
  .then(() => {
    logger.info("seed.wallets.delete_success");

    // Insert new wallets
    return Wallet.insertMany(wallets);
  })
  .then(() => {
    logger.info("seed.wallets.insert_success");
  })
  .catch((err) => {
    logger.error("seed.wallets.error", { error: err });
  });
