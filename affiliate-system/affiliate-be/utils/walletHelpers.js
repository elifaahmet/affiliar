const mongoose = require("mongoose");
const { ObjectId } = require("mongodb");
const Redis = require("ioredis");
const { logMsg } = require("../middlewares/logger");
const { MSG } = require("../middlewares/log-messages");

const redis = new Redis({
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: Number(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || null,
});

/**
 * Create and send a notification to a player
 * @param {Object} options - Notification options
 * @param {string} options.playerId - Player ID
 * @param {string} options.title - Notification title
 * @param {string} options.message - Notification message
 * @param {string} options.type - Notification type (info, success, warning, error)
 * @param {string} options.url - Optional URL to navigate to
 * @returns {Promise<Object>} - Created notification
 */
async function createAndSendNotification({
  playerId,
  title,
  message,
  type = "info",
  url = null,
}) {
  try {
    const db = mongoose.connection.db;

    // Create notification document
    const notification = {
      playerId: new ObjectId(playerId),
      title,
      message,
      type,
      url,
      isRead: false,
      createdAt: new Date(),
    };

    // Insert into database
    const result = await db
      .collection("playernotifications")
      .insertOne(notification);

    const createdNotification = {
      _id: result.insertedId,
      ...notification,
    };

    // Publish to Redis for real-time WebSocket delivery
    const channel = `notifications:player:${playerId}`;
    const payload = {
      id: result.insertedId.toString(),
      title,
      message,
      type,
      url,
      isRead: false,
      createdAt: notification.createdAt.toISOString(),
    };

    await redis.publish(channel, JSON.stringify(payload));

    logMsg(MSG.NOTIFICATION_SENT, {
      playerId,
      notificationId: result.insertedId.toString(),
      title,
      type,
    });

    return createdNotification;
  } catch (error) {
    logMsg(
      MSG.NOTIFICATION_ERR,
      {
        playerId,
        title,
        error_message: error.message,
        error_stack: error.stack,
      },
      "error"
    );
    throw error;
  }
}

/**
 * Send wallet credit notification
 * @param {Object} options
 * @param {string} options.playerId - Player ID
 * @param {number} options.amount - Amount credited
 * @param {string} options.currency - Currency code
 * @param {string} options.balance - New balance
 */
async function sendWalletCreditNotification({
  playerId,
  amount,
  currency,
  balance,
}) {
  return createAndSendNotification({
    playerId,
    title: "Deposit Successful",
    message: `${Number(amount)?.toFixed(
      2
    )} ${currency} has been added to your wallet. New balance: ${Number(
      balance
    )?.toFixed(2)} ${currency}`,
    type: "success",
    url: "/transactions",
  });
}

/**
 * Send wallet debit notification
 * @param {Object} options
 * @param {string} options.playerId - Player ID
 * @param {number} options.amount - Amount debited
 * @param {string} options.currency - Currency code
 * @param {string} options.balance - New balance
 */
async function sendWalletDebitNotification({
  playerId,
  amount,
  currency,
  balance,
}) {
  return createAndSendNotification({
    playerId,
    title: "Withdrawal Processed",
    message: `${Number(amount)?.toFixed(
      2
    )} ${currency} has been deducted from your wallet. New balance: ${Number(
      balance
    )?.toFixed(2)} ${currency}`,
    type: "info",
    url: "/transactions",
  });
}

module.exports = {
  createAndSendNotification,
  sendWalletCreditNotification,
  sendWalletDebitNotification,
};
