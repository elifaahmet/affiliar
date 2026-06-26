const User = require("../../models/User");
const { notify } = require("../../utils/notify");

// Operator → affiliates broadcast. The operator composes a one-off update
// (e.g. "new payout schedule", "we shipped click tracking"); every one of their
// affiliates gets an in-app notification, and an email too unless they've muted
// announcements. Reuses notify() so the per-type opt-out is honoured for free.

// Affiliates of the requesting operator who have an email address.
async function recipients(operatorId) {
  return User.find({
    role: "affiliate",
    operatorId,
    isDeleted: { $ne: true },
  })
    .select({ _id: 1, email: 1, emailNotifications: 1, notificationPrefs: 1 })
    .lean();
}

function emailableCount(users) {
  return users.filter((u) => {
    if (!u.email || u.emailNotifications === false) return false;
    const prefs = u.notificationPrefs;
    const pref = prefs ? (typeof prefs.get === "function" ? prefs.get("announcement") : prefs.announcement) : undefined;
    return pref !== false;
  }).length;
}

const announcementController = {
  // GET /announcements/audience — how many affiliates will receive this.
  async audience(req, res) {
    try {
      const users = await recipients(req.affiliateUser.operatorId);
      res.json({ total: users.length, emailable: emailableCount(users) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  // POST /announcements/broadcast  { subject, message }
  async broadcast(req, res) {
    try {
      const operator = req.affiliateUser;
      const subject = String(req.body?.subject || "").trim().slice(0, 150);
      const message = String(req.body?.message || "").trim().slice(0, 4000);
      if (!subject || !message) {
        return res.status(400).json({ error: "Subject and message are required" });
      }

      const users = await recipients(operator.operatorId);
      const emailable = emailableCount(users);

      // Fire-and-forget per affiliate: in-app row always, email when opted in.
      await Promise.all(
        users.map((u) =>
          notify({
            userId: u._id,
            operatorId: operator.operatorId,
            type: "announcement",
            title: subject,
            body: message,
            link: "/affiliate/dashboard",
          }),
        ),
      );

      res.json({ recipients: users.length, emailed: emailable });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
};

module.exports = announcementController;
