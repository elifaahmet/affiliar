"use strict";

const Notification = require("../models/Notification");
const User = require("../models/User");
const { logger } = require("../middlewares/logger");

// Fire-and-forget single-user notification. Never throws into the caller —
// a notification failure must not break the business action that triggered it.
async function notify({ userId, operatorId = null, type, title, body = null, link = null }) {
  if (!userId || !type || !title) return;
  try {
    await Notification.create({ userId, operatorId, type, title, body, link });
  } catch (err) {
    logger.error("notify.create_failed", { type, error: err?.message });
  }
}

// Notify the operator's OWNER users (operator-role, no brand scope) — used for
// operator-wide alerts (new signup, fraud, billing). Brand-scoped teammates
// are intentionally skipped to avoid noise outside their remit.
async function notifyOperatorOwners(operatorId, payload) {
  if (!operatorId) return;
  try {
    const owners = await User.find({
      operatorId,
      role: "operator",
      isDeleted: { $ne: true },
      $or: [{ brandIds: { $size: 0 } }, { brandIds: { $exists: false } }],
    })
      .select({ _id: 1 })
      .lean();
    await Promise.all(
      owners.map((o) => notify({ ...payload, userId: o._id, operatorId })),
    );
  } catch (err) {
    logger.error("notify.owners_failed", { error: err?.message });
  }
}

module.exports = { notify, notifyOperatorOwners };
