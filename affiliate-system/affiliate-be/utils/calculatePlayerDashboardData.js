const dayjs = require("dayjs");
const mongoose = require("mongoose");
const WithdrawalTransaction = require("../models/WithdrawalTransaction");
const DepositTransaction = require("../models/DepositTransaction");
const Currency = require("../models/Currency");
const redisClient = require("../redis/redisClient");
const { logger } = require("../middlewares/logger");

const ObjectId = mongoose.Types.ObjectId;

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

// Get currency code from Redis (fallback to Mongo-based map)
const normalizeCurrencyId = (currency) =>
  currency && typeof currency === "object"
    ? currency._id || currency.id
    : currency;

const getCurrencyCode = async (currency, fallbackMap) => {
  const currencyId = normalizeCurrencyId(currency);
  if (!currencyId) return currency?.code || "EUR";
  const redisKey = `currency:${currencyId}`;
  let code = await redisClient.get(redisKey);
  return code || fallbackMap[currencyId.toString()] || "EUR";
};

const calculatePlayerDashboardData = async (playerId, start, end) => {
  if (!ObjectId.isValid(playerId)) {
    throw new Error(`Invalid ObjectId: ${playerId}`);
  }
  const _playerId = new ObjectId(playerId);

  // Fetch fallback currency map from DB
  const currencies = await Currency.find({ isDeleted: false });
  const fallbackMap = currencies.reduce((acc, curr) => {
    acc[curr._id.toString()] = curr.code;
    return acc;
  }, {});

  const [deposits, withdrawals, pendingWithdrawals] = await Promise.all([
    DepositTransaction.find({
      playerId: _playerId,
      status: { $in: SUCCESS_STATUSES },
      method: { $ne: "correction" },
      updatedAt: { $gte: start, $lte: end },
    }),
    WithdrawalTransaction.find({
      playerId: _playerId,
      status: { $in: SUCCESS_STATUSES },
      method: { $ne: "correction" },
      updatedAt: { $gte: start, $lte: end },
    }),
    WithdrawalTransaction.find({
      playerId: _playerId,
      status: { $in: ["pending", "processing"] },
      updatedAt: { $gte: start, $lte: end },
    }),
  ]);

  const toEUR = async (amount, currencyId) => {
    const code = await getCurrencyCode(currencyId, fallbackMap);
    const rate = exchangeRates[code] || 1;
    return amount * rate;
  };

  // Async reduce for Redis-based currency conversions
  const sumAsync = async (arr) => {
    let sum = 0;
    for (const item of arr) {
      sum += await toEUR(item.amount || item.total || 0, item.currency);
    }
    return sum;
  };
  /* const rawWallets = await redisClient.get(`wallet:${playerId}`);
  let wallets = [];

  if (rawWallets) {
    try {
      wallets = JSON.parse(rawWallets);
    } catch (err) {
      logger.error("player_dashboard.invalid_wallet_json", {
        playerId,
        error: err,
      });
    }
  } */

  const balance = 0; //await sumAsync(wallets);
  const [totalDeposits, totalWithdrawals, pendingWithdrawalsSum] =
    await Promise.all([
      sumAsync(deposits),
      sumAsync(withdrawals),
      sumAsync(pendingWithdrawals),
    ]);

  return {
    total_deposits: totalDeposits,
    total_withdrawals: totalWithdrawals,
    pending_withdrawals: pendingWithdrawalsSum,
    player_balance: balance,
    deposits_count: deposits.length,
    withdrawals_count: withdrawals.length,
  };
};

module.exports = calculatePlayerDashboardData;
