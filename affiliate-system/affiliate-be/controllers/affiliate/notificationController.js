"use strict";

const Notification = require("../../models/Notification");
const User = require("../../models/User");

// Notification types the user can tune email delivery for, by role. In-app is
// always delivered; this only controls the email channel.
const TYPE_CATALOG = {
  affiliate: [
    { type: "payout_paid", label: "Payout paid" },
    { type: "commission_approved", label: "Commission approved" },
    { type: "announcement", label: "Announcements from your operator" },
    { type: "bonus_earned", label: "Bonus campaign earned" },
  ],
  operator: [
    { type: "new_affiliate", label: "New affiliate signup" },
    { type: "fraud_flagged", label: "Fraud flagged" },
    { type: "bonus_awarded", label: "Bonus campaign awards" },
  ],
};

// Read a per-type email pref off the user doc (Map on a hydrated doc, plain
// object on a lean doc). Absent = on.
function readTypePref(prefs, type) {
  if (!prefs) return true;
  const v = typeof prefs.get === "function" ? prefs.get(type) : prefs[type];
  return v !== false;
}

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

// GET /notifications/prefs — master switch + per-type email prefs for the
// caller's role.
exports.getPrefs = async (req, res) => {
  try {
    const user = req.affiliateUser;
    if (!user?._id) return res.status(401).json({ error: "Unauthenticated" });
    const catalog = TYPE_CATALOG[user.role] || [];
    res.json({
      emailNotifications: user.emailNotifications !== false,
      types: catalog.map((t) => ({
        type: t.type,
        label: t.label,
        email: readTypePref(user.notificationPrefs, t.type),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PATCH /notifications/prefs — update the master switch and/or per-type email
// prefs. Body: { email?: bool (master), types?: { [type]: bool } }.
exports.setPrefs = async (req, res) => {
  try {
    const user = req.affiliateUser;
    if (!user?._id) return res.status(401).json({ error: "Unauthenticated" });

    const set = {};
    if (req.body?.email !== undefined) set.emailNotifications = !!req.body.email;

    const allowed = new Set((TYPE_CATALOG[user.role] || []).map((t) => t.type));
    if (req.body?.types && typeof req.body.types === "object") {
      for (const [type, val] of Object.entries(req.body.types)) {
        if (allowed.has(type)) set[`notificationPrefs.${type}`] = !!val;
      }
    }
    if (Object.keys(set).length === 0) return res.status(400).json({ error: "Nothing to update" });

    await User.updateOne({ _id: user._id }, { $set: set });
    res.json({ ok: true });
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
