const dayjs = require("dayjs");

const WithdrawalTransaction = require("../../models/WithdrawalTransaction");
const DepositTransaction = require("../../models/DepositTransaction");
const Player = require("../../models/Player");
const Wallet = require("../../models/Wallet");
const Currency = require("../../models/Currency");
const { toRedis } = require("../dashboardService");
const redisClient = require("../redisClient");
const { scanKeys } = require("../scanKeys");
const { logger } = require("../../middlewares/logger");

const exchangeRates = {
  USD: 0.85,
  GBP: 1.15,
  INR: 0.011,
  JPY: 0.0077,
  RUB: 0.012,
  CNY: 0.13,
  TRY: 0.095,
  EUR: 1,
  BDT: 0.0085,
  HKD: 0.11,
};
const SUCCESS_STATUSES = ["success", "Success"];

async function getPlayerBalanceEUR(playerId) {
  const walletData = await redisClient.get(`wallet:${playerId}`);
  if (!walletData) return 0;

  let wallets;
  try {
    wallets = JSON.parse(walletData);
  } catch (err) {
    logger.error("redis.dashboard.invalid_wallet_json", {
      error: err,
      playerId,
    });
    return 0;
  }

  const balances = await Promise.all(
    wallets.map((wallet) => toEUR(wallet.total || 0, wallet.currency))
  );

  const playerBalanceEUR = balances.reduce((acc, val) => acc + val, 0);
  return Number(playerBalanceEUR.toFixed(2));
}

// not using it anywhere for now
const generateDailyDashboard = async () => {
  const yesterdayStart = dayjs().subtract(1, "day").startOf("day").toDate();
  const yesterdayEnd = dayjs().subtract(1, "day").endOf("day").toDate();
  const dateKey = dayjs().subtract(1, "day").format("YYYY-MM-DD");

  const currencies = await Currency.find({ isDeleted: false }).lean();
  const currencyMap = Object.fromEntries(
    currencies.map((c) => [c._id.toString(), c.code])
  );

  const normalizeCurrencyId = (currency) =>
    currency && typeof currency === "object" ? currency._id || currency.id : currency;
  const getCurrencyCode = (currency) => {
    const currencyId = normalizeCurrencyId(currency);
    return currencyMap[currencyId?.toString()] || currency?.code || "EUR";
  };
  const toEUR = (amount = 0, currency) => {
    const code = getCurrencyCode(currency);
    const rate = exchangeRates[code] || 1;
    return amount * rate;
  };

  // Confirmed Withdrawals
  const confirmedWithdrawals = await WithdrawalTransaction.aggregate([
    {
      $match: {
        status: { $in: SUCCESS_STATUSES },
        updatedAt: { $gte: yesterdayStart, $lte: yesterdayEnd },
      },
    },
    {
      $group: {
        _id: "$currency",
        total: { $sum: "$amount" },
      },
    },
  ]);

  const totalWithdrawalsEUR = confirmedWithdrawals.reduce(
    (acc, tx) => acc + toEUR(tx.total, tx._id),
    0
  );

  // Pending Withdrawals
  const pendingWithdrawals = await WithdrawalTransaction.aggregate([
    {
      $match: {
        status: { $in: ["pending", "processing"] },
      },
    },
    {
      $group: {
        _id: "$currency",
        total: { $sum: "$amount" },
      },
    },
  ]);

  const pendingWithdrawalsEUR = pendingWithdrawals.reduce(
    (acc, tx) => acc + toEUR(tx.total, tx._id),
    0
  );

  // Confirmed Deposits
  const confirmedDeposits = await DepositTransaction.aggregate([
    {
      $match: {
        status: { $in: SUCCESS_STATUSES },
        updatedAt: { $gte: yesterdayStart, $lte: yesterdayEnd },
      },
    },
    {
      $group: {
        _id: "$currency",
        total: { $sum: "$amount" },
      },
    },
  ]);

  const totalDepositsEUR = confirmedDeposits.reduce(
    (acc, tx) => acc + toEUR(tx.total, tx._id),
    0
  );

  // Unique player deposits
  const uniquePlayersDeposit = await DepositTransaction.distinct("playerId", {
    status: { $in: SUCCESS_STATUSES },
    updatedAt: { $gte: yesterdayStart, $lte: yesterdayEnd },
  });
  const totalPlayersDeposit = await DepositTransaction.countDocuments({
    status: { $in: SUCCESS_STATUSES },
    updatedAt: { $gte: startDate, $lte: endDate },
  });

  // Player logins
  const uniquePlayersLogin = await Player.countDocuments({
    lastLogin: { $gte: yesterdayStart, $lte: yesterdayEnd },
  });

  const totalPlayersLogin = uniquePlayersLogin; // same logic for now

  // Players who withdrew
  const makingWithdrawals = await WithdrawalTransaction.distinct("playerId", {
    status: { $in: SUCCESS_STATUSES },
    updatedAt: { $gte: yesterdayStart, $lte: yesterdayEnd },
  });

  const keys = await scanKeys("wallet:*");

  let totalBalanceEUR = 0;

  // 2. Loop through and sum all balances

  for (const key of keys) {
    const value = await redisClient.get(key);
    if (!value) continue;

    try {
      const wallets = JSON.parse(value);
      if (!Array.isArray(wallets)) continue;

      for (const wallet of wallets) {
        let rawAmount = wallet.total;

        // Handle Mongo Decimal format
        if (
          typeof rawAmount === "object" &&
          rawAmount !== null &&
          "$numberDecimal" in rawAmount
        ) {
          rawAmount = rawAmount["$numberDecimal"];
        }

        const amount = parseFloat(rawAmount || 0);

        // ✅ Await the conversion
        const eur = await toEUR(amount, wallet.currency);
        totalBalanceEUR += eur;
      }
    } catch (err) {
      logger.error("redis.dashboard.wallet_process_failed", {
        key,
        error: err,
      });
    }
  }

  const playerBalanceEUR = totalBalanceEUR;

  const data = {
    total_deposits: Number(totalDepositsEUR.toFixed(2)),
    total_withdrawals: Number(totalWithdrawalsEUR.toFixed(2)),
    pending_withdrawals: Number(pendingWithdrawalsEUR.toFixed(2)),
    total_players_deposit: totalPlayersDeposit,
    unique_players_deposit: uniquePlayersDeposit.length,
    total_players_login: totalPlayersLogin,
    unique_players_login: uniquePlayersLogin,
    making_withdrawals: makingWithdrawals.length,
    player_balance: Number(playerBalanceEUR.toFixed(2)),
  };

  await toRedis(dateKey, data);
  logger.info("redis.dashboard.updated", { dateKey });
};

module.exports = generateDailyDashboard;
