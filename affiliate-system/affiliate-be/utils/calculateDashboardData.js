const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
dayjs.extend(utc);

const WithdrawalTransaction = require("../models/WithdrawalTransaction");
const DepositTransaction = require("../models/DepositTransaction");
const Player = require("../models/Player");
const Currency = require("../models/Currency");
const redisClient = require("../redis/redisClient");

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

const normalizeCurrencyId = (currency) =>
  currency && typeof currency === "object"
    ? currency._id || currency.id
    : currency;

const toNumber = (value) => {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value === "object") {
    if (value.$numberDecimal) {
      const parsed = Number(value.$numberDecimal);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    if (typeof value.toString === "function") {
      const parsed = Number(value.toString());
      return Number.isFinite(parsed) ? parsed : 0;
    }
  }
  return 0;
};

const getCurrencyCode = async (currency) => {
  const currencyId = normalizeCurrencyId(currency);
  if (!currencyId) return currency?.code || "EUR";

  const redisKey = `currency:${currencyId}`;
  let code = await redisClient.get(redisKey);

  if (!code) {
    const currencyDoc = await Currency.findOne({
      _id: currencyId,
      isDeleted: false,
    }).lean();

    code = currencyDoc?.code || "EUR";

    if (currencyDoc) {
      await redisClient.set(redisKey, code);
      await redisClient.expire(redisKey, 60 * 60 * 24 * 30);
    }
  }

  return code;
};

const toEUR = async (amount, currencyId) => {
  const code = await getCurrencyCode(currencyId);
  const rate = exchangeRates[code] || 1;
  return toNumber(amount) * rate;
};

const buildEmptyDashboardData = () => ({
  total_deposits: 0,
  total_withdrawals: 0,
  total_corrections_up: 0,
  total_corrections_down: 0,
  total_players_correction: 0,
  pending_withdrawals: 0,
  total_players_deposit: 0,
  unique_players_deposit: 0,
  total_players_login: 0,
  unique_players_login: 0,
  total_withdrawals_count: 0,
  unique_players_withdrawal: 0,
  player_balance: 0,
});

const calculateDashboardData = async ({ start, end } = {}) => {
  const startDate =
    start || dayjs().utc().subtract(1, "day").startOf("day").toDate();
  const endDate = end || dayjs().utc().subtract(1, "day").endOf("day").toDate();

  const confirmedWithdrawalsRaw = await WithdrawalTransaction.find({
    status: { $in: SUCCESS_STATUSES },
    method: { $ne: "correction" },
    updatedAt: { $gte: startDate, $lte: endDate },
  }).select("amount currency");

  let totalWithdrawals = 0;
  for (const tx of confirmedWithdrawalsRaw) {
    totalWithdrawals += await toEUR(tx.amount, tx.currency);
  }

  const pendingWithdrawalsRaw = await WithdrawalTransaction.find({
    status: { $in: ["pending", "processing"] },
    updatedAt: { $gte: startDate, $lte: endDate },
  }).select("amount currency");

  let totalPendingWithdrawals = 0;
  for (const tx of pendingWithdrawalsRaw) {
    totalPendingWithdrawals += await toEUR(tx.amount, tx.currency);
  }

  const confirmedDepositsRaw = await DepositTransaction.find({
    status: { $in: SUCCESS_STATUSES },
    method: { $ne: "correction" },
    updatedAt: { $gte: startDate, $lte: endDate },
  }).select("amount currency");

  let totalDeposits = 0;
  for (const tx of confirmedDepositsRaw) {
    totalDeposits += await toEUR(tx.amount, tx.currency);
  }

  const correctionDepositsRaw = await DepositTransaction.find({
    status: { $in: SUCCESS_STATUSES },
    method: "correction",
    updatedAt: { $gte: startDate, $lte: endDate },
  }).select("amount currency");

  const correctionWithdrawalsRaw = await WithdrawalTransaction.find({
    status: { $in: SUCCESS_STATUSES },
    method: "correction",
    updatedAt: { $gte: startDate, $lte: endDate },
  }).select("amount currency");

  let totalCorrectionsUp = 0;
  for (const tx of correctionDepositsRaw) {
    totalCorrectionsUp += await toEUR(tx.amount, tx.currency);
  }

  let totalCorrectionsDown = 0;
  for (const tx of correctionWithdrawalsRaw) {
    totalCorrectionsDown += await toEUR(tx.amount, tx.currency);
  }

  const uniquePlayersDeposit = await DepositTransaction.distinct("playerId", {
    status: { $in: SUCCESS_STATUSES },
    method: { $ne: "correction" },
    updatedAt: { $gte: startDate, $lte: endDate },
  });

  const totalPlayersDeposit = await DepositTransaction.countDocuments({
    status: { $in: SUCCESS_STATUSES },
    method: { $ne: "correction" },
    updatedAt: { $gte: startDate, $lte: endDate },
  });

  const uniquePlayersLogin = await Player.distinct("_id", {
    lastLogin: { $gte: startDate, $lte: endDate },
  });

  const totalPlayersLogin = await Player.countDocuments({
    lastLogin: { $gte: startDate, $lte: endDate },
  });

  const uniqueWithdrawals = await WithdrawalTransaction.distinct("playerId", {
    status: { $in: SUCCESS_STATUSES },
    method: { $ne: "correction" },
    updatedAt: { $gte: startDate, $lte: endDate },
  });

  const totalWithdrawalsCount = await WithdrawalTransaction.countDocuments({
    status: { $in: SUCCESS_STATUSES },
    method: { $ne: "correction" },
    updatedAt: { $gte: startDate, $lte: endDate },
  });

  const totalPlayersCorrection =
    correctionDepositsRaw.length + correctionWithdrawalsRaw.length;

  let playerBalance = 0;

  return {
    total_deposits: Number(totalDeposits.toFixed(2)),
    total_withdrawals: Number(totalWithdrawals.toFixed(2)),
    total_corrections_up: Number(totalCorrectionsUp.toFixed(2)),
    total_corrections_down: Number(totalCorrectionsDown.toFixed(2)),
    total_players_correction: totalPlayersCorrection,
    pending_withdrawals: Number(totalPendingWithdrawals.toFixed(2)),
    total_players_deposit: totalPlayersDeposit,
    unique_players_deposit: uniquePlayersDeposit.length,
    total_players_login: totalPlayersLogin,
    unique_players_login: uniquePlayersLogin.length,
    total_withdrawals_count: totalWithdrawalsCount,
    unique_players_withdrawal: uniqueWithdrawals.length,
    player_balance: Number(playerBalance.toFixed(2)),
  };
};

module.exports = calculateDashboardData;
