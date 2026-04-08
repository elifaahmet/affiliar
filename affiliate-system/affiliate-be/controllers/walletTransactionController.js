const DepositTransaction = require("../models/DepositTransaction"); // Adjust the path to your DepositTransaction model
const Player = require("../models/Player");
const Wallet = require("../models/Wallet");
const dayjs = require("dayjs");
const CasinoTransaction = require("../models/CasinoTransaction");
const GameV2 = require("../models/GameV2");
const WithdrawalTransaction = require("../models/WithdrawalTransaction");
const mongoose = require("mongoose");
const redisClient = require("../redis/redisClient");
const { MSG } = require("../middlewares/log-messages");
const { logMsg } = require("../middlewares/logger");
const { update } = require("./adminuserController");
const { buildDateRange } = require("../utils/dateRange");
const convertToEuro = (amount, currency) => {
  const rates = {
    USD: 0.85,
    EUR: 1,
    TRY: 0.095,
    GBP: 1.15,
    INR: 0.011,
    JPY: 0.0077,
    RUB: 0.012,
    CNY: 0.13,
    HKD: 0.11,
    BDT: 0.0085,
  };
  return amount * (rates[currency?.toUpperCase()] || 1);
};
async function sumRedisTotalsForRange(redisClient, startStr, endStr, type) {
  // type: "withdrawals" | "deposits"
  const fieldName =
    type === "withdrawals" ? "total_withdrawals" : "total_deposits";

  const parse = (s) => {
    if (!s) return null;
    const [dd, mm, yyyy] = s.split("-").map(Number); // expecting DD-MM-YYYY
    const date = new Date(yyyy, mm - 1, dd);
    return isNaN(date) ? null : date;
  };

  const toKey = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`;

  const start = parse(startStr);
  const end = parse(endStr);
  if (!start || !end) return null;

  // normalize to midnight
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  let sum = 0;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const key = `dashchannel:${toKey(d)}`;
    const raw = await redisClient.hget(key, fieldName);
    sum += Number(raw || 0);
  }
  return sum;
}
exports.getAllTransactionsByWalletId = async (req, res) => {
  const { walletId } = req.params;
  const { transactionType, startDate, endDate } = req.query;

  try {
    const [depositTransactions, withdrawalTransactions] = await Promise.all([
      DepositTransaction.find({ walletId }),
      WithdrawalTransaction.find({ walletId }),
    ]);

    const convertAmount = (amount) =>
      amount && typeof amount.toString === "function"
        ? parseFloat(amount.toString())
        : amount;

    const formattedDeposits = depositTransactions.map((tx) => ({
      ...tx._doc,
      type: "Deposit",
      amount: convertAmount(tx.amount),
    }));

    const formattedWithdrawals = withdrawalTransactions.map((tx) => ({
      ...tx._doc,
      type: "Withdrawal",
      amount: convertAmount(tx.amount),
    }));

    let allTransactions = [...formattedDeposits, ...formattedWithdrawals];

    if (transactionType === "Deposit" || transactionType === "Withdrawal") {
      allTransactions = allTransactions.filter(
        (tx) => tx.type === transactionType,
      );
    }

    if (startDate || endDate) {
      const { start, end, error } = buildDateRange({
        startDate,
        endDate,
        tz: req.query.tz,
      });
      if (error) {
        return res.status(400).json({ success: false, message: error });
      }
      if (start || end) {
        allTransactions = allTransactions.filter((tx) => {
          const date = new Date(tx.confirmed_at);
          if (Number.isNaN(date.getTime())) return false;
          if (start && date < start) return false;
          if (end && date > end) return false;
          return true;
        });
      }
    }

    const sorted = allTransactions.sort(
      (a, b) => new Date(b.confirmed_at) - new Date(a.confirmed_at),
    );

    if (sorted.length === 0) {
      return res
        .status(404)
        .json({ message: "No transactions found for this wallet ID" });
    }

    res.status(200).json(sorted);
  } catch (error) {
    req.logMsg(
      MSG.WALLET_TX_LIST_BY_WALLET_ERR,
      { error, walletId, transactionType, startDate, endDate },
      "error",
    );
    res.status(500).json({ message: "Internal Server Error", error });
  }
};
// Get all transactions

exports.getAllTransactions = async (req, res) => {
  try {
    const transactions = await DepositTransaction.find();

    const formatted = transactions.map((tx) => ({
      ...tx.toObject(),
      amount: parseFloat(tx.amount.toString()),
    }));

    res.status(200).json(formatted);
  } catch (error) {
    req.logMsg(MSG.WALLET_TX_ALL_ERR, { error }, "error");
    res.status(500).json({ message: "Error fetching transactions", error });
  }
};

exports.getAllTransactionsWithCasinoByWalletId = async (req, res) => {
  const { walletId } = req.params;
  const {
    page = 1,
    limit = 50,
    startDate,
    endDate,
    type,
    product,
    paymentSystem,
    exportType,
  } = req.query;

  try {
    const exportTypeNorm =
      typeof exportType === "string" ? exportType.toLowerCase() : "";
    const isFullExport = exportTypeNorm === "full";
    const isExportRequest = exportTypeNorm !== "";

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.max(parseInt(limit, 10) || 50, 1);
    const skip = (pageNum - 1) * limitNum;

    const wallet = await Wallet.findById(walletId)
      .select("_id playerId")
      .lean();
    if (!wallet) {
      return res.status(404).json({ message: "Wallet not found" });
    }

    let start = null;
    let end = null;
    if (!isFullExport && (startDate || endDate)) {
      const range = buildDateRange({
        startDate,
        endDate,
        tz: req.query.tz,
      });
      if (range.error) {
        return res.status(400).json({
          success: false,
          message: range.error,
        });
      }
      start = range.start;
      end = range.end;
    }

    const typeNormalized = String(isFullExport ? "" : type || "")
      .toLowerCase()
      .trim();
    const productNormalized = String(isFullExport ? "" : product || "")
      .toLowerCase()
      .trim();
    const paymentSystemNormalized = String(
      isFullExport ? "" : paymentSystem || "",
    )
      .toLowerCase()
      .trim();

    const casinoTxnTypes = ["bet", "result", "rollback", "error"];
    const isCasinoTxnType = casinoTxnTypes.includes(typeNormalized);

    if (
      typeNormalized &&
      !["deposit", "withdrawal", "casino", ...casinoTxnTypes].includes(
        typeNormalized,
      )
    ) {
      return res.status(200).json({
        success: true,
        data: [],
        total: 0,
        page: pageNum,
        totalPages: 0,
      });
    }

    const hasProductFilter = Boolean(productNormalized);

    let wantDeposits =
      !hasProductFilter && (!typeNormalized || typeNormalized === "deposit");
    let wantWithdrawals =
      !hasProductFilter && (!typeNormalized || typeNormalized === "withdrawal");
    let wantCasino =
      hasProductFilter ||
      !typeNormalized ||
      typeNormalized === "casino" ||
      isCasinoTxnType;

    if (isCasinoTxnType) {
      wantDeposits = false;
      wantWithdrawals = false;
    }

    if (paymentSystemNormalized) {
      wantCasino = false;
    }

    if (paymentSystemNormalized && !wantDeposits && !wantWithdrawals) {
      return res.status(200).json({
        success: true,
        data: [],
        total: 0,
        page: pageNum,
        totalPages: 0,
      });
    }

    const depositQuery = { walletId: wallet._id };
    const withdrawalQuery = { walletId: wallet._id };
    const casinoQuery = { wallet_id: wallet._id };

    if (start && end) {
      depositQuery.confirmed_at = { $gte: start, $lte: end };
      withdrawalQuery.confirmed_at = { $gte: start, $lte: end };
      casinoQuery.createdAt = { $gte: start, $lte: end };
    }

    if (paymentSystemNormalized) {
      const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const normalizedSpace = paymentSystemNormalized
        .replace(/[_-]+/g, " ")
        .trim();
      const titleCase = normalizedSpace.replace(/\b\w/g, (c) =>
        c.toUpperCase(),
      );

      if (paymentSystemNormalized === "by admin") {
        depositQuery.paymentType = "Offline";
        withdrawalQuery.paymentType = "Offline";
      } else if (
        paymentSystemNormalized === "sans getirsin" ||
        paymentSystemNormalized === "sans-getirsin"
      ) {
        const providerRegex = new RegExp(
          `^(${escapeRegExp(titleCase)}|Payzeasy)$`,
          "i",
        );
        depositQuery.$or = [
          { provider: providerRegex },
          { paymentType: "Offline" },
        ];
        withdrawalQuery.$or = [
          { provider: providerRegex },
          { paymentType: "Offline" },
        ];
      } else {
        const providerRegex = new RegExp(`^${escapeRegExp(titleCase)}$`, "i");
        depositQuery.provider = providerRegex;
        withdrawalQuery.provider = providerRegex;
      }
    }

    let casinoGameCodesFilter = null;
    if (productNormalized) {
      const rawToken = productNormalized.startsWith("casino//")
        ? productNormalized.slice("casino//".length)
        : productNormalized;
      const token = rawToken.trim();
      if (!token) {
        return res.status(200).json({
          success: true,
          data: [],
          total: 0,
          page: pageNum,
          totalPages: 0,
        });
      }
      if (token !== "casino") {
        const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const tokenRegex = new RegExp(`^${escapeRegExp(token)}$`, "i");
        const games = await GameV2.find(
          {
            $or: [{ game_code: tokenRegex }, { game_name: tokenRegex }],
          },
          { game_code: 1 },
        ).lean();
        casinoGameCodesFilter = games.map((g) => g.game_code).filter(Boolean);
        if (casinoGameCodesFilter.length === 0) {
          return res.status(200).json({
            success: true,
            data: [],
            total: 0,
            page: pageNum,
            totalPages: 0,
          });
        }
      }
    }

    if (casinoGameCodesFilter) {
      casinoQuery.game_code = { $in: casinoGameCodesFilter };
    }
    if (isCasinoTxnType) {
      casinoQuery.type = typeNormalized;
    }

    const [depositTransactions, withdrawalTransactions, casinoTransactions] =
      await Promise.all([
        wantDeposits
          ? DepositTransaction.find(depositQuery)
              .select(
                "id transactionDate confirmed_at updatedAt createdAt amount provider paymentType afterBalance tx_hash network depositAddress external_tx_id cryptoCurrency tx_id",
              )
              .lean()
          : [],
        wantWithdrawals
          ? WithdrawalTransaction.find(withdrawalQuery)
              .select(
                "id transactionDate confirmed_at tx_id updatedAt createdAt addressData payout_amount amount provider paymentType afterBalance",
              )
              .lean()
          : [],
        wantCasino
          ? CasinoTransaction.find(casinoQuery)
              .select("_id createdAt type amount balance game_code")
              .lean()
          : [],
      ]);

    const toFloat = (val) =>
      val && typeof val.toString === "function"
        ? parseFloat(val.toString())
        : (val ?? 0);

    const pickDate = (tx) =>
      tx.transactionDate || tx.confirmed_at || tx.updatedAt || tx.createdAt;

    const formattedDeposits = depositTransactions.map((tx) => ({
      id: tx.tx_id || tx.id,
      date: pickDate(tx),
      type: "Deposit",
      amount: toFloat(tx.amount),

      paymentSystem:
        tx.provider || (tx.paymentType === "Offline" ? "By Admin" : "Unknown"),
    }));

    const formattedWithdrawals = withdrawalTransactions.map((tx) => ({
      id: tx.tx_id || tx.id,
      date: pickDate(tx),
      type: "Withdrawal",
      amount: toFloat(tx.addressData?.payout_amount) || toFloat(tx.amount),
      paymentSystem:
        tx.provider || (tx.paymentType === "Offline" ? "By Admin" : "Unknown"),
    }));

    const gameCodes = [
      ...new Set(
        casinoTransactions
          .map((tx) => tx.game_code)
          .filter((code) => Boolean(code)),
      ),
    ];
    const gameNameByCode = new Map();
    if (gameCodes.length) {
      const games = await GameV2.find(
        { game_code: { $in: gameCodes } },
        { game_code: 1, game_name: 1 },
      ).lean();
      games.forEach((g) => {
        if (g?.game_code) gameNameByCode.set(g.game_code, g.game_name);
      });
    }

    const formattedCasino = casinoTransactions.map((tx) => {
      const gameName = gameNameByCode.get(tx.game_code);
      const product = `Casino//${gameName || tx.game_code || "Unknown"}`;
      return {
        id: tx._id,
        date: tx.createdAt,
        type: tx.type,
        amount: toFloat(tx.amount),
        paymentSystem: null,
        product,
      };
    });

    const allTransactions = [
      ...formattedDeposits,
      ...formattedWithdrawals,
      ...formattedCasino,
    ];

    const sorted = allTransactions.sort((a, b) => {
      const aDate = a.date ? new Date(a.date).getTime() : 0;
      const bDate = b.date ? new Date(b.date).getTime() : 0;
      return bDate - aDate;
    });

    const total = sorted.length;
    const totalPages = Math.ceil(total / limitNum);
    const data = isExportRequest ? sorted : sorted.slice(skip, skip + limitNum);

    res.status(200).json({
      success: true,
      data,
      total,
      page: pageNum,
      totalPages,
    });
  } catch (error) {
    req.logMsg(
      MSG.WALLET_TX_LIST_CASINO_BY_WALLET_ERR,
      { error, walletId },
      "error",
    );
    res.status(500).json({ message: "Internal Server Error", error });
  }
};
exports.getGeneralDepositTransactions = async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      currency,
      playerId,
      provider,
      method,
      status,
      exportType,
    } = req.query;
    const rawPage = req.query.page;
    const rawLimit = req.query.limit;
    const page = rawPage ?? 1;
    const limit = rawLimit ?? 50;

    const exportTypeNorm =
      typeof exportType === "string" ? exportType.toLowerCase() : "";
    const isFullExport = exportTypeNorm === "full";
    const isExportRequest = exportTypeNorm !== "";

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const matchStage = {};

    if (!isFullExport) {
      if (startDate && endDate) {
        const { start, end, error } = buildDateRange({
          startDate,
          endDate,
          tz: req.query.tz,
        });
        if (error) {
          return res.status(400).json({ success: false, message: error });
        }
        if (start && end) {
          matchStage.createdAt = { $gte: start, $lte: end };
        }
      }

      if (provider) matchStage.provider = provider;
      if (method) matchStage.method = method;
      if (status) {
        const escapedStatus = status.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        matchStage.status = new RegExp(`^${escapedStatus}$`, "i");
      }
    }
    const pipeline = [
      { $match: matchStage },
      {
        $lookup: {
          from: "wallets",
          localField: "walletId",
          foreignField: "_id",
          as: "wallet",
        },
      },
      { $unwind: "$wallet" },
      {
        $lookup: {
          from: "players",
          localField: "playerId",
          foreignField: "_id",
          as: "player",
        },
      },
      { $unwind: "$player" },
      {
        $lookup: {
          from: "currencies",
          localField: "wallet.currency",
          foreignField: "_id",
          as: "currencyDetails",
        },
      },
      { $unwind: "$currencyDetails" },

      ...(currency
        ? [{ $match: { "currencyDetails.code": currency.toUpperCase() } }]
        : []),
      ...(playerId ? [{ $match: { "player.id": parseInt(playerId) } }] : []),

      {
        $addFields: {
          amount: { $toDouble: "$amount" },
          amountEur: {
            $function: {
              body: function (amount, currency) {
                const rates = {
                  USD: 0.85,
                  EUR: 1,
                  TRY: 0.095,
                  GBP: 1.15,
                  INR: 0.011,
                  JPY: 0.0077,
                  RUB: 0.012,
                  CNY: 0.13,
                  HKD: 0.11,
                  BDT: 0.0085,
                };
                return amount * (rates[(currency || "").toUpperCase()] || 1);
              },
              args: [{ $toDouble: "$amount" }, "$currencyDetails.code"],
              lang: "js",
            },
          },
        },
      },

      {
        $project: {
          _id: 0,
          id: { $toString: "$tx_id" },
          playerId: { $toString: "$player.id" },
          createdDate: "$createdAt",
          type: { $literal: "Deposit" },
          currency: "$currencyDetails.code",
          symbol: "$currencyDetails.symbol",
          method: "$method",
          provider: "$provider",
          confirmedDate: "$confirmed_at",
          amount: "$amount",
          amountEur: 1,
          status: 1,
          accepted: "$transactionDate",
          note: "$note",
          tx_hash: "$tx_hash",
          network: "$network",
          external_tx_id: "$external_tx_id",
          depositAddress: "$depositAddress",
          cryptoCurrency: "$cryptoCurrency",
          updatedAt: 1,
        },
      },

      { $sort: { createdDate: -1 } },

      {
        $facet: {
          total: [{ $count: "count" }],
          totals: [
            {
              $group: {
                _id: null,
                totalAmountEur: { $sum: "$amountEur" },
                totalAmount: { $sum: "$amount" },
              },
            },
            {
              $project: {
                _id: 0,
                totalAmountEur: 1,
                totalAmount: 1,
              },
            },
          ],
          data: [
            ...(!isExportRequest
              ? [{ $skip: skip }, { $limit: parseInt(limit) }]
              : []),
          ],
        },
      },
    ];

    const result = await DepositTransaction.aggregate(pipeline);
    const total = result?.[0]?.total?.[0]?.count || 0;
    const totalsDoc = result?.[0]?.totals?.[0] || null;

    const totalAmountEur = totalsDoc ? totalsDoc.totalAmountEur : 0;
    const totalAmount = totalsDoc ? totalsDoc.totalAmount : 0;

    // === Redis total across range (GLOBAL ONLY) ===
    // Only use Redis when no extra filters are applied (global totals)
    const hasExtraFilters = !!(currency || playerId || provider || method);
    let totalEurFromRedis = null;

    if (!hasExtraFilters && startDate && endDate) {
      try {
        const sum = await sumRedisTotalsForRange(
          redisClient,
          startDate,
          endDate,
          "deposits",
        );

        if (Number.isFinite(sum)) totalEurFromRedis = sum;
      } catch (e) {
        const err = e instanceof Error ? e : new Error(e?.message || String(e));
        logMsg(MSG.REDIS_ADD_ERR, { error: err }, "error");
      }
    }

    res.json({
      success: true,
      data: result?.[0]?.data || [],
      total,
      totalAmountEur,
      totalAmount,
      ...(totalEurFromRedis !== null && { totalEurFromRedis }),
    });
  } catch (error) {
    req.logMsg(
      MSG.WALLET_TX_DEPOSIT_GENERAL_ERR,
      {
        error,
        startDate,
        endDate,
        currency,
        provider,
        method,
      },
      "error",
    );
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

exports.getGeneralWithdrawalTransactions = async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      currency,
      playerId,
      provider,
      method,
      exportType,
    } = req.query;
    const rawPage = req.query.page;
    const rawLimit = req.query.limit;
    const page = rawPage ?? 1;
    const limit = rawLimit ?? 50;

    const exportTypeNorm =
      typeof exportType === "string" ? exportType.toLowerCase() : "";
    const isFullExport = exportTypeNorm === "full";
    const isExportRequest = exportTypeNorm !== "";
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 50;
    const skip = (pageNum - 1) * limitNum;

    const matchStage = { status: "success" };

    if (!isFullExport) {
      if (startDate && endDate) {
        const { start, end, error } = buildDateRange({
          startDate,
          endDate,
          tz: req.query.tz,
        });
        if (error) {
          return res.status(400).json({ success: false, message: error });
        }
        if (start && end) {
          matchStage.createdAt = { $gte: start, $lte: end };
        }
      }

      if (provider) matchStage.provider = provider;
      if (method) matchStage.method = method;
    }

    const pipeline = [
      { $match: matchStage },

      {
        $lookup: {
          from: "wallets",
          localField: "walletId",
          foreignField: "_id",
          as: "wallet",
        },
      },
      { $unwind: "$wallet" },

      {
        $lookup: {
          from: "players",
          localField: "playerId",
          foreignField: "_id",
          as: "player",
        },
      },
      { $unwind: "$player" },

      {
        $lookup: {
          from: "currencies",
          localField: "wallet.currency",
          foreignField: "_id",
          as: "currencyDetails",
        },
      },
      { $unwind: "$currencyDetails" },

      ...(currency
        ? [
            {
              $match: {
                "currencyDetails.code": String(currency).toUpperCase(),
              },
            },
          ]
        : []),

      ...(playerId
        ? [{ $match: { "player.id": parseInt(playerId, 10) } }]
        : []),

      {
        $addFields: {
          amount: { $toDouble: "$amount" },
          amountEur: {
            $function: {
              body: function (amount, currency) {
                const rates = {
                  USD: 0.85,
                  EUR: 1,
                  TRY: 0.095,
                  GBP: 1.15,
                  INR: 0.011,
                  JPY: 0.0077,
                  RUB: 0.012,
                  CNY: 0.13,
                  HKD: 0.11,
                  BDT: 0.0085,
                };
                return amount * (rates[(currency || "").toUpperCase()] || 1);
              },
              args: [{ $toDouble: "$amount" }, "$currencyDetails.code"],
              lang: "js",
            },
          },
        },
      },

      { $sort: { createdAt: -1 } },

      {
        $facet: {
          total: [{ $count: "count" }],

          totals: [
            {
              $group: {
                _id: null,
                totalAmount: { $sum: "$amount" },
                totalAmountEur: { $sum: "$amountEur" },
              },
            },
            { $project: { _id: 0, totalAmount: 1, totalAmountEur: 1 } },
          ],

          data: [
            ...(!isExportRequest
              ? [{ $skip: skip }, { $limit: limitNum }]
              : []),

            // projection sadece data için en sona
            {
              $project: {
                _id: 0,
                id: { $toString: "$tx_id" },
                playerId: { $toString: "$player.id" },
                createdDate: "$createdAt",
                type: { $literal: "Withdrawal" },
                currency: "$currencyDetails.code",
                symbol: "$currencyDetails.symbol",
                provider: 1,
                method: 1,
                paymentType: "$paymentType",
                amount: 1,
                amountEur: 1,
                accepted: "$confirmed_at",
                note: "$note",
              },
            },
          ],
        },
      },
    ];

    const agg = await WithdrawalTransaction.aggregate(pipeline);

    const total = agg?.[0]?.total?.[0]?.count || 0;
    const totalsDoc = agg?.[0]?.totals?.[0] || {};
    const totalAmount = totalsDoc.totalAmount ?? 0;
    const totalAmountEur = totalsDoc.totalAmountEur ?? 0;

    return res.json({
      success: true,
      data: agg?.[0]?.data || [],
      total,
      totalAmount,
      totalAmountEur,
    });
  } catch (error) {
    const { startDate, endDate, currency, playerId, provider, method } =
      req.query || {};

    req.logMsg(
      MSG.WALLET_TX_WITHDRAW_GENERAL_ERR,
      { error, startDate, endDate, currency, playerId, provider, method },
      "error",
    );

    return res
      .status(500)
      .json({ success: false, message: "Internal Server Error" });
  }
};

// Get transactions by wallet ID
exports.getTransactionsByWalletId = async (req, res) => {
  const { walletId } = req.params;
  try {
    const transactions = await DepositTransaction.find({ walletId });

    if (!transactions.length) {
      return res
        .status(404)
        .json({ message: "No transactions found for this wallet ID" });
    }

    const formattedTransactions = transactions.map((tx) => ({
      ...tx.toObject(),
      amount: parseFloat(tx.amount.toString()),
    }));

    res.status(200).json(formattedTransactions);
  } catch (error) {
    req.logMsg(MSG.WALLET_TX_GET_BY_WALLET_ERR, { error, walletId }, "error");
    res.status(500).json({ message: "Error fetching transactions", error });
  }
};

exports.getDepositsByUserId = async (req, res) => {
  try {
    const { userId } = req.params;

    // Optional: Validate user exists
    const user = await Player.findOne({ id: userId });
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // Find the user's wallet(s)
    const wallets = await Wallet.find({ playerId: user._id }, "_id");
    const walletIds = wallets.map((wallet) => wallet._id);

    // Fetch all deposit transactions by walletId, exclude "__v"
    const deposits = await DepositTransaction.find({
      walletId: { $in: walletIds },
    })
      .select("-__v")
      .populate({
        path: "walletId",
        select: "id total currency",
        populate: {
          path: "currency",
          select: "code symbol",
        },
      })
      .sort({ confirmed_at: -1 });

    // Format amounts to normal numbers
    const formattedDeposits = deposits.map((tx) => ({
      ...tx.toObject(),
      amount: tx.amount ? parseFloat(tx.amount.toString()) : 0,
      walletId: {
        ...tx.walletId.toObject(),
        total: tx.walletId?.total
          ? parseFloat(tx.walletId.total.toString())
          : 0,
      },
    }));

    res.json({ success: true, data: formattedDeposits });
  } catch (error) {
    req.logMsg(MSG.WALLET_TX_DEPOSITS_BY_USER_ERR, { error, userId }, "error");
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};
