const Player = require("../models/Player");
const Wallet = require("../models/Wallet");
require("../models/WithdrawAddress");
const axios = require("axios");
const mongoose = require("mongoose");
const WithdrawalTransaction = require("../models/WithdrawalTransaction");
const Currency = require("../models/Currency");
const {
  publishPlayerWalletBalance,
  updateDashboard,
  publishDashboardUpdate,
} = require("../redis/dashboardService");
const redisClient = require("../redis/redisClient");
const { MSG } = require("../middlewares/log-messages"); // <- add this
const dayjs = require("dayjs");
const key = Buffer.from("01234567890123456789012345678901"); // 32-byte key
const iv = Buffer.from("1234567890123456"); // 16-byte IV
const crypto = require("crypto");
const { buildDateRange } = require("../utils/dateRange");
function decryptCBC(hex) {
  try {
    const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
    let decrypted = decipher.update(hex, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (err) {
    return null;
  }
}
const decryptAccountHolder = (addressData) => {
  const encrypted = addressData?.account_holder;
  if (!encrypted || typeof encrypted !== "string") return null;
  return decryptCBC(encrypted);
};
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

const getTransactionWithdrawalHistory = async (req, res) => {
  const { walletId } = req.params;
  try {
    const transactions = await WithdrawalTransaction.find({ walletId });

    if (!transactions || transactions.length === 0) {
      req.logMsg?.(MSG.WITHDRAW_HISTORY_NOT_FOUND, { walletId }, "warn");
      return res.status(404).json({ error: "Transactions not found" });
    }

    const formattedTransactions = transactions.map((tx) => {
      const accountHolder = decryptAccountHolder(tx.addressData);
      return {
        ...tx.toObject(),
        amount: parseFloat(tx.amount.toString()),
        addressData: {
          ...(tx.addressData || {}),
          account_holder: accountHolder,
        },
      };
    });

    return res.status(200).json(formattedTransactions);
  } catch (error) {
    req.logMsg?.(MSG.WITHDRAW_HISTORY_ERR, { error, walletId }, "error");
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

const rejectTransaction = async (req, res) => {
  const { transactionId, adminId } = req.params;
  const { note } = req.body;

  try {
    const transaction = await WithdrawalTransaction.findOne({
      tx_id: transactionId,
    });

    if (!transaction) {
      req.logMsg?.(MSG.WITHDRAW_TX_NOT_FOUND, { transactionId }, "warn");
      return res.status(404).json({ error: "Transaction not found" });
    }

    if (transaction.status !== "pending" || transaction.isApproved) {
      return res
        .status(400)
        .json({ error: "Transaction is already processed" });
    }

    const wallet = await Wallet.findById(transaction.walletId);
    if (!wallet) {
      req.logMsg?.(
        MSG.WITHDRAW_WALLET_NOT_FOUND,
        { walletId: transaction.walletId },
        "warn",
      );
      return res.status(404).json({ error: "Wallet not found" });
    }

    const currentTotal = parseFloat(wallet.total?.toString() || "0");
    const refunded = currentTotal + parseFloat(transaction.amount.toString());
    wallet.total = mongoose.Types.Decimal128.fromString(refunded.toString());
    await wallet.save();

    transaction.status = "rejected";
    transaction.rollBackCompleted = true;
    transaction.note = note;
    transaction.rejection = {
      rejected_by: "Admin",
      rejected_at: new Date(),
      reject_reason_code: "ADMIN_REJECTED",
      reject_reason: "Rejected by Admin",
    };
    transaction.rollback_finalized_at = new Date();
    transaction.updatedAt = new Date();

    await transaction.save();

    // Update Redis dashboard to remove from pending_withdrawals
    try {
      const currency = await Currency.findById(transaction.currency);
      if (currency) {
        const amountInEUR = convertToEuro(
          parseFloat(transaction.amount.toString()),
          currency.code,
        );
        const dateKey = dayjs().format("YYYY-MM-DD");

        // Decrease pending_withdrawals amount since it's no longer pending
        await updateDashboard(dateKey, {
          pending_withdrawals: -amountInEUR,
        });

        // Verify the Redis update worked
        const redisCheck = await redisClient.hget(
          `dashchannel:${dateKey}`,
          "pending_withdrawals",
        );

        // IMMEDIATELY update WebSocket cache with new pending_withdrawals
        const cacheKey = `dash:latest:data:today:${dateKey}`;
        const existingCache = await redisClient.get(cacheKey);
        if (existingCache) {
          const cacheData = JSON.parse(existingCache);
          cacheData.data.pending_withdrawals = redisCheck; // Update with actual Redis value
          await redisClient.setex(
            cacheKey,
            60 * 60 * 24,
            JSON.stringify(cacheData),
          );
        }

        await publishDashboardUpdate();
      }
    } catch (redisError) {
      req.logMsg?.(
        "REDIS_PENDING_WITHDRAWAL_UPDATE_ERR",
        { error: redisError, transactionId },
        "error",
      );
      // Don't fail the transaction rejection if Redis update fails
    }

    await publishPlayerWalletBalance(wallet.playerId, wallet);

    return res.status(200).json({
      message: "Transaction rejected and wallet refunded",
      transaction,
    });
  } catch (error) {
    req.logMsg?.(MSG.WITHDRAW_REJECT_ERR, { error, transactionId }, "error");
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

const getAllWithdrawalTransactionsByUserId = async (req, res) => {
  try {
    const { playerId } = req.params;

    const player = await Player.findOne({ id: playerId })
      .select("email")
      .exec();
    if (!player) {
      req.logMsg?.(MSG.WITHDRAW_PLAYER_NOT_FOUND, { playerId }, "warn");
      return res
        .status(404)
        .send({ success: false, message: "Player not found" });
    }

    const wallets = await Wallet.find({ playerId: player._id });
    if (!wallets || wallets.length === 0) {
      req.logMsg?.(MSG.WITHDRAW_PLAYER_WALLETS_NOT_FOUND, { playerId }, "warn");
      return res
        .status(404)
        .send({ success: false, message: "No wallets found for the player" });
    }

    const walletIds = wallets.map((w) => w._id);

    const transactions = await WithdrawalTransaction.find({
      walletId: { $in: walletIds },
    })
      .populate({
        path: "walletId",
        select: "currency playerId total",
        populate: [
          { path: "currency", select: "name code symbol" },
          { path: "playerId", select: "email" },
        ],
      })
      .select(
        "_id amount status transactionDate transactionId type addressData paymentType isApproved",
      )
      .exec();

    if (!transactions || transactions.length === 0) {
      req.logMsg?.(MSG.WITHDRAW_PLAYER_TXS_NOT_FOUND, { playerId }, "warn");
      return res
        .status(404)
        .send({ success: false, message: "No withdrawal transactions found" });
    }

    const formattedTransactions = transactions.map((transaction) => ({
      _id: transaction._id,
      amount:
        transaction?.addressData?.payout_amount ||
        parseFloat(transaction.amount.toString()),
      addressData: {
        ...(transaction.addressData || {}),
        account_holder: decryptAccountHolder(transaction.addressData),
      },
      status: transaction.status,
      isApproved: transaction.isApproved,
      walletTotal: transaction.walletId.total,
      transactionDate: transaction.transactionDate,
      transactionId: transaction.transactionId,
      type: transaction.type,
      walletId: transaction.walletId._id,
      paymentType: transaction.paymentType,
      playerEmail: transaction.walletId.playerId.email,
      currency: {
        name: transaction.walletId.currency.name,
        code: transaction.walletId.currency.code,
        symbol: transaction.walletId.currency.symbol,
      },
    }));

    return res
      .status(200)
      .send({ success: true, transactions: formattedTransactions });
  } catch (error) {
    req.logMsg?.(MSG.WITHDRAW_USER_LIST_ERR, { error }, "error");
    return res.status(500).send({
      success: false,
      message: "An error occurred",
      error,
    });
  }
};

const approveWithdrawalTransaction = async (req, res) => {
  const { transactionId } = req.params;
  const adminId = req.params?.adminId || "admin@example.com";
  const { note } = req.body;

  try {
    const transaction = await WithdrawalTransaction.findOne({
      tx_id: transactionId,
    }).populate("cryptoDetails.wallet_address");

    if (!transaction) {
      req.logMsg?.(MSG.WITHDRAW_TX_NOT_FOUND, { transactionId }, "warn");
      return res.status(404).json({ error: "Transaction not found" });
    }

    if (transaction.status !== "pending" || transaction.isApproved) {
      return res.status(400).json({
        error: "Only transactions in 'pending' status can be approved",
      });
    }

    // --------- S A N S G E T I R S I N  B R A N C H  ---------
    if (transaction.provider === "sansgetirsin") {
      const player = await Player.findById(transaction.playerId).select(
        "email id _id",
      );
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      // decrypt wallet address
      const encryptedWallet =
        transaction?.cryptoDetails?.wallet_address.address;

      const decryptedWallet = encryptedWallet
        ? decryptCBC(encryptedWallet)
        : null;

      if (!decryptedWallet) {
        return res
          .status(500)
          .json({ error: "Failed to decrypt wallet address" });
      }

      // build body for local sans-getirsin withdraw endpoint
      const body = {
        userId: String(
          player.id || player._id?.toString() || transaction.playerId,
        ),
        amount: Number(transaction.amount || 0),
        paymentMethod: Number(transaction?.cryptoDetails?.payment_id), // 7–13
        walletAddress: decryptedWallet,
        network: transaction?.cryptoDetails?.network, // e.g. "TRC20"
        walletType: transaction?.cryptoDetails?.wallet_type || null, // only BTC (if you store it)
        extra: {
          tx_id: transaction.tx_id,
          walletId: String(transaction.walletId),
          currencyId: String(transaction.currency),
          transactionId: String(transaction._id),
        },
      };

      // call internal payment-management service
      const sansResponse = await axios.post(
        "http://127.0.0.1:4142/sans-getirsin/create-withdraw",
        body,
        {
          timeout: 15000,
          validateStatus: () => true,
        },
      );

      if (!sansResponse.data?.success) {
        const rawErrorMsg =
          sansResponse.data?.raw?.error ||
          sansResponse.data?.error ||
          sansResponse.data?.message;
        const isRateLimited =
          typeof rawErrorMsg === "string" &&
          rawErrorMsg
            .toLowerCase()
            .includes("lütfen süre sınırından sonra tekrar deneyiniz");
        const statusCode = isRateLimited ? 429 : 502;
        const clientMessage = isRateLimited
          ? "Try again in some time again"
          : "Sansgetirsin withdraw creation failed";

        req.logMsg?.(
          "SANS_CREATE_WITHDRAW_FAILED",
          { transactionId, body, sansBody: sansResponse.data },
          "error",
        );
        return res.status(statusCode).json({
          error: clientMessage,
          detail: sansResponse.data,
        });
      }

      // mark approved same style as Payzeasy branch
      await WithdrawalTransaction.updateOne(
        { tx_id: transactionId },
        {
          $set: {
            isApproved: true,
            note,
            approved: { approved_by: adminId, approved_at: new Date() },
          },
        },
      );

      return res.status(200).json({
        message: "Transaction approved and sent to Sansgetirsin",
        sansResult: sansResponse.data,
      });
    }
    // --------- E N D  S A N S G E T I R S I N  B R A N C H ---------

    // --------- A L P H A P O ---------
    if (transaction.provider === "AlphaPo") {
      const alphapoBody = {
        tx_id: transactionId,
        foreign_id: String(transaction.tx_id),
        end_user_reference: String(transaction.playerId),
      };

      const alphapoResponse = await axios.post(
        `http://127.0.0.1:4450/alphapo/withdrawal/execute/${transaction.playerId}`,
        alphapoBody,
        {
          timeout: 15000,
          validateStatus: () => true,
        },
      );

      if (
        alphapoResponse.status >= 300 ||
        alphapoResponse.data?.success === false
      ) {
        req.logMsg?.(
          "ALPHAPO_EXECUTE_WITHDRAW_FAILED",
          { transactionId, alphapoBody, alphapoResult: alphapoResponse.data },
          "error",
        );
        return res.status(502).json({
          error: "AlphaPo withdraw execute failed",
          detail: alphapoResponse.data,
        });
      }

      await WithdrawalTransaction.updateOne(
        { tx_id: transactionId },
        {
          $set: {
            isApproved: true,
            note,
            approved: { approved_by: adminId, approved_at: new Date() },
          },
        },
      );

      return res.status(200).json({
        message: "Transaction approved and sent to AlphaPo",
        alphapoResult: alphapoResponse.data,
      });
    }
    // --------- E N D  A L P H A P O ---------

    // --------- P A Y Z E A S Y ---------
    const payoutResponse = await axios.post(
      "http://127.0.0.1:4400/payzeasy/payout-request",
      {
        tx_id: transactionId,
      },
    );

    await WithdrawalTransaction.updateOne(
      { tx_id: transactionId },
      {
        $set: {
          isApproved: true,
          note,
          approved: { approved_by: adminId, approved_at: new Date() },
        },
      },
    );

    return res.status(200).json({
      message: "Transaction approved and sent to Payzeasy",
      payoutResponse: payoutResponse.data,
    });
  } catch (error) {
    req.logMsg?.(MSG.WITHDRAW_APPROVE_ERR, { error, transactionId }, "error");
    return res.status(500).json({
      error: "Approval failed",
      detail: error?.response?.data || error.message,
    });
  }
};

const retryWithdrawalTransaction = async (req, res) => {
  const { transactionId } = req.params;

  try {
    const transaction = await WithdrawalTransaction.findOne({
      tx_id: transactionId,
    });

    if (!transaction) {
      req.logMsg?.(MSG.WITHDRAW_TX_NOT_FOUND, { transactionId }, "warn");
      return res.status(404).json({ error: "Transaction not found" });
    }

    if (transaction.status !== "error") {
      return res
        .status(400)
        .json({ error: "Only transactions in 'error' status can be retried" });
    }

    if (transaction.retry_count <= 0) {
      return res.status(400).json({ error: "Retry limit exceeded" });
    }

    const payoutResponse = await axios.post(
      "http://127.0.0.1:4400/payzeasy/payout-request",
      {
        tx_id: transactionId,
      },
    );

    return res.status(200).json({
      message: "Retry payout sent to Payzeasy",
      payoutResponse: payoutResponse.data,
    });
  } catch (error) {
    req.logMsg?.(MSG.WITHDRAW_RETRY_ERR, { error, transactionId }, "error");
    return res.status(500).json({
      error: "Retry failed",
      detail: error?.response?.data || error.message,
    });
  }
};

const getUnapprovedWithdrawals = async (req, res) => {
  try {
    const {
      playerId,
      username,
      state,
      requestStartDate,
      requestEndDate,
      updatedStartDate,
      updatedEndDate,
      paidStartDate,
      paidEndDate,
      paymentSystemId,
      paymentSystemName,
      currency,
      isVerifiedPlayer,
      exportType,
    } = req.query;
    const rawPage = req.query.page;
    const rawLimit = req.query.limit;
    const page = rawPage ?? 1;
    const limit = rawLimit ?? 50;
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 50;
    const skip = (pageNum - 1) * limitNum;

    const exportTypeNorm =
      typeof exportType === "string" ? exportType.toLowerCase() : "";
    const isFullExport = exportTypeNorm === "full";
    const isExportRequest = exportTypeNorm !== "";

    const match = { status: { $ne: "success" } };

    if (!isFullExport) {
      if (playerId) match["player.id"] = +playerId;
      if (username) {
        match["player.username"] = {
          $regex: username,
          $options: "i",
        };
      }
      if (state) match.status = state;
      if (paymentSystemId) match.external_tx_id = paymentSystemId;
      if (paymentSystemName) match.provider = paymentSystemName;
      if (currency) match["currencyInfo.code"] = currency;
      if (isVerifiedPlayer)
        match["player.isVerified"] = isVerifiedPlayer === "yes";

      const requestRange = buildDateRange({
        startDate: requestStartDate,
        endDate: requestEndDate,
        tz: req.query.tz,
      });
      if (requestRange.error) {
        return res
          .status(400)
          .json({ success: false, message: requestRange.error });
      }
      if (requestRange.start || requestRange.end) {
        const createdAtFilter = {};
        if (requestRange.start) createdAtFilter.$gte = requestRange.start;
        if (requestRange.end) createdAtFilter.$lte = requestRange.end;
        match.createdAt = createdAtFilter;
      }

      const updatedRange = buildDateRange({
        startDate: updatedStartDate,
        endDate: updatedEndDate,
        tz: req.query.tz,
      });
      if (updatedRange.error) {
        return res
          .status(400)
          .json({ success: false, message: updatedRange.error });
      }
      if (updatedRange.start || updatedRange.end) {
        const updatedAtFilter = {};
        if (updatedRange.start) updatedAtFilter.$gte = updatedRange.start;
        if (updatedRange.end) updatedAtFilter.$lte = updatedRange.end;
        match.updatedAt = updatedAtFilter;
      }

      const paidRange = buildDateRange({
        startDate: paidStartDate,
        endDate: paidEndDate,
        tz: req.query.tz,
      });
      if (paidRange.error) {
        return res
          .status(400)
          .json({ success: false, message: paidRange.error });
      }
      if (paidRange.start || paidRange.end) {
        const confirmedAtFilter = {};
        if (paidRange.start) confirmedAtFilter.$gte = paidRange.start;
        if (paidRange.end) confirmedAtFilter.$lte = paidRange.end;
        match.confirmed_at = confirmedAtFilter;
      }
    }

    const transactionsAgg = await WithdrawalTransaction.aggregate([
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
          localField: "currency",
          foreignField: "_id",
          as: "currencyInfo",
        },
      },
      { $unwind: "$currencyInfo" },
      { $match: match },
      { $sort: { createdAt: -1 } },

      {
        $facet: {
          total: [{ $count: "count" }],
          data: [
            ...(!isExportRequest
              ? [{ $skip: skip }, { $limit: limitNum }]
              : []),
            {
              $project: {
                tx_id: 1,
                amount: { $toDouble: "$amount" },
                walletId: 1,
                status: 1,
                method: 1,
                addressData: 1,
                playerId: "$player.id",
                provider: 1,
                confirmed_at: 1,
                retry_count: 1,
                createdAt: 1,
                updatedAt: 1,
                idempotency_key: 1,
                isApproved: 1,
                external_tx_id: 1,
                verifyLevel: "$player.verifyLevel",
                rejection: 1,
                note: 1,
                approved: 1,
                username: "$player.username",
                currency: "$currencyInfo.code",
              },
            },
          ],
        },
      },
    ]);

    const total = transactionsAgg?.[0]?.total?.[0]?.count || 0;
    const data = transactionsAgg?.[0]?.data || [];
    const totalPages = Math.ceil(total / limitNum);

    const formatted = data.map((tx) => ({
      ...tx,
      eur_amount: parseFloat(convertToEuro(tx.amount, tx.currency).toFixed(2)),
      addressData: {
        ...(tx.addressData || {}),
        account_holder: decryptAccountHolder(tx.addressData),
      },
    }));

    return res.status(200).json({
      success: true,
      data: formatted,
      total,
      page: pageNum,
      totalPages,
    });
  } catch (error) {
    req.logMsg?.(MSG.WITHDRAW_UNAPPROVED_LIST_ERR, { error }, "error");
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = {
  getAllWithdrawalTransactionsByUserId,
  getTransactionWithdrawalHistory,
  rejectTransaction,
  getUnapprovedWithdrawals,
  retryWithdrawalTransaction,
  approveWithdrawalTransaction,
};
