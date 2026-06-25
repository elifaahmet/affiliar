"use strict";

const Notification = require("../../models/Notification");
const User = require("../../models/User");

// GET /notifications?limit= — the caller's notifications + unread count.
// Works for any authenticated user (operator or affiliate); scoped to self.
exports.list = async (req, res) => {
  try {
    const userId = req.affiliateUser?._id;
    if (!userId) return res.status(401).json({ error: "Unauthenticated" });
    const lim = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);

    const [items, unreadCount] = await Promise.all([
      Notification.find({ userId })
        .sort({ createdAt: -1 })
        .limit(lim)
        .lean(),
      Notification.countDocuments({ userId, read: false }),
    ]);
    res.json({
      notifications: items,
      unreadCount,
      emailNotifications: req.affiliateUser?.emailNotifications !== false,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PATCH /notifications/prefs — toggle email delivery for the caller.
exports.setPrefs = async (req, res) => {
  try {
    const userId = req.affiliateUser?._id;
    if (!userId) return res.status(401).json({ error: "Unauthenticated" });
    const enabled = !!req.body?.email;
    await User.updateOne({ _id: userId }, { $set: { emailNotifications: enabled } });
    res.json({ emailNotifications: enabled });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PATCH /notifications/:id/read — mark one read (only your own).
exports.markRead = async (req, res) => {
  try {
    const userId = req.affiliateUser?._id;
    if (!userId) return res.status(401).json({ error: "Unauthenticated" });
    await Notification.updateOne(
      { _id: req.params.id, userId },
      { $set: { read: true, readAt: new Date() } },
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /notifications/read-all — mark all your notifications read.
exports.markAllRead = async (req, res) => {
  try {
    const userId = req.affiliateUser?._id;
    if (!userId) return res.status(401).json({ error: "Unauthenticated" });
    await Notification.updateMany(
      { userId, read: false },
      { $set: { read: true, readAt: new Date() } },
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
