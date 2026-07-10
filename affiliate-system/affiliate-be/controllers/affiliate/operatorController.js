const Operator = require("../../models/Operator");
const User = require("../../models/User");
const Brand = require("../../models/Brand");
const { getPlan } = require("../../utils/planLimits");
const { getMonthlyActivePlayers } = require("../../utils/playerUsage");
const { sendOperatorInvite } = require("../../utils/mailer");
const { logger } = require("../../middlewares/logger");

// An operator user with no brandIds is an "owner" (full access). Only owners
// may manage the team and the owner-only sections.
function isOwner(user) {
  return !(Array.isArray(user.brandIds) && user.brandIds.length > 0);
}

const operatorController = {
  getInviteLink: async (req, res) => {
    try {
      const user = req.affiliateUser;

      if (user.role !== "operator") {
        return res.status(403).json({ error: "Only operators can generate invite links" });
      }

      if (!user.operatorId) {
        return res.status(400).json({ error: "User is not linked to an operator" });
      }

      const baseUrl = process.env.APP_URL || process.env.AFFILIATE_FE_URL || "http://localhost:3001";
      const inviteLink = `${baseUrl}/register?operatorId=${user.operatorId}`;

      return res.json({ inviteLink });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },

  getPlan: async (req, res) => {
    try {
      const user = req.affiliateUser;

      if (!user.operatorId) {
        return res.status(400).json({ error: "User is not linked to an operator" });
      }

      const operator = await Operator.findById(user.operatorId).lean();
      if (!operator || operator.isDeleted) {
        return res.status(404).json({ error: "Operator not found" });
      }

      const planKey = operator.plan || "tier1";
      const basePlan = getPlan(planKey);
      // Cascade: base subscription flags overridden by Operator.featureOverrides.
      // Custom (off-ladder) features are unlocked here so the FE sees them in
      // `limits` exactly like the regular plan flags.
      const overridesRaw = operator.featureOverrides;
      const overrides =
        overridesRaw instanceof Map
          ? Object.fromEntries(overridesRaw)
          : (overridesRaw && typeof overridesRaw === "object" ? { ...overridesRaw } : {});
      const limits = { ...basePlan, ...overrides };

      return res.json({ plan: planKey, limits, basePlan, overrides });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },

  // GET /operators/player-usage → this month's active players vs the plan cap.
  // Drives the usage meter + over-limit upgrade nudge. lifetimeFree tenants
  // report a null cap (never limited).
  playerUsage: async (req, res) => {
    try {
      const user = req.affiliateUser;
      if (!user.operatorId) {
        return res.status(400).json({ error: "User is not linked to an operator" });
      }
      const operator = await Operator.findById(user.operatorId)
        .select({ plan: 1, lifetimeFree: 1, isDeleted: 1 })
        .lean();
      if (!operator || operator.isDeleted) {
        return res.status(404).json({ error: "Operator not found" });
      }
      const planKey = operator.plan || "tier1";
      const maxPlayers = operator.lifetimeFree ? null : (getPlan(planKey).maxPlayers ?? null);
      const activePlayers = await getMonthlyActivePlayers(operator._id);
      const over = maxPlayers != null && activePlayers > maxPlayers;
      return res.json({ plan: planKey, activePlayers, maxPlayers, over });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },

  // GET /operators/digest-preference → the current user's report-email cadence.
  // Works for operators and affiliates (updates their own User).
  getDigestPreference: async (req, res) => {
    try {
      const u = await User.findById(req.affiliateUser._id)
        .select({ digestFrequency: 1, emailNotifications: 1 }).lean();
      return res.json({
        digestFrequency: u?.digestFrequency || "weekly",
        emailNotifications: u?.emailNotifications !== false,
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },

  // PATCH /operators/digest-preference { digestFrequency }
  setDigestPreference: async (req, res) => {
    try {
      const val = String(req.body?.digestFrequency || "");
      if (!["weekly", "monthly", "off"].includes(val)) {
        return res.status(400).json({ error: "digestFrequency must be weekly, monthly or off" });
      }
      await User.updateOne({ _id: req.affiliateUser._id }, { $set: { digestFrequency: val } });
      return res.json({ digestFrequency: val });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },

  getMe: async (req, res) => {
    try {
      const user = req.affiliateUser;

      if (!user.operatorId) {
        return res.status(404).json({ error: "No operator linked to this user" });
      }

      const operator = await Operator.findById(user.operatorId);
      if (!operator || operator.isDeleted) {
        return res.status(404).json({ error: "Operator not found" });
      }

      return res.json(operator);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },

  // GET /operators/team — list the operator's team (all operator-role users
  // under this operator), each with their brand scope. Visible to any
  // operator user, but the page is only surfaced to owners in the UI.
  listTeam: async (req, res) => {
    try {
      const user = req.affiliateUser;
      if (user.role !== "operator" || !user.operatorId) {
        return res.status(403).json({ error: "Operators only" });
      }

      const [users, brands] = await Promise.all([
        User.find({
          operatorId: user.operatorId,
          role: "operator",
          isDeleted: { $ne: true },
        })
          .select({ email: 1, username: 1, name: 1, status: 1, brandIds: 1, lastLogin: 1, createdAt: 1 })
          .sort({ createdAt: 1 })
          .lean(),
        Brand.find({ operatorId: user.operatorId }).select({ _id: 1, name: 1 }).lean(),
      ]);

      const brandName = new Map(brands.map((b) => [String(b._id), b.name]));

      return res.json({
        users: users.map((u) => ({
          _id: String(u._id),
          email: u.email,
          username: u.username,
          name: u.name,
          status: u.status,
          isOwner: !(u.brandIds && u.brandIds.length),
          isSelf: String(u._id) === String(user._id),
          brands: (u.brandIds || []).map((id) => ({
            _id: String(id),
            name: brandName.get(String(id)) || "—",
          })),
          lastLogin: u.lastLogin || null,
        })),
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },

  // POST /operators/team — invite a brand-scoped operator user. Owner-only
  // (also guarded by requireOperatorOwner). The invitee activates via the
  // standard /auth/activate flow and is restricted to the selected brands.
  inviteTeamMember: async (req, res) => {
    try {
      const owner = req.affiliateUser;
      if (owner.role !== "operator" || !owner.operatorId) {
        return res.status(403).json({ error: "Operators only" });
      }
      if (!isOwner(owner)) {
        return res.status(403).json({ error: "owner_only" });
      }

      const { email, name, username, brandIds } = req.body || {};
      if (!email || !name || !username) {
        return res.status(400).json({ error: "email, name, username are required" });
      }
      if (!Array.isArray(brandIds) || brandIds.length === 0) {
        return res.status(400).json({ error: "Select at least one brand for this user" });
      }

      // Every brand must belong to this operator — never let an owner scope a
      // user to another tenant's brand.
      const ownBrands = await Brand.find({
        _id: { $in: brandIds },
        operatorId: owner.operatorId,
      })
        .select({ _id: 1 })
        .lean();
      if (ownBrands.length !== brandIds.length) {
        return res.status(400).json({ error: "One or more brands are invalid for this operator" });
      }

      const existing = await User.findOne({
        $or: [{ email: email.toLowerCase().trim() }, { username: username.trim() }],
        isDeleted: false,
      });
      if (existing) {
        return res.status(409).json({ error: "Email or username already taken" });
      }

      const newUser = await User.create({
        email: email.toLowerCase().trim(),
        username: username.trim(),
        name: name.trim(),
        password: "PENDING",
        role: "operator",
        status: "pending",
        operatorId: owner.operatorId,
        brandIds: ownBrands.map((b) => b._id),
        isDeleted: false,
      });

      const operator = await Operator.findById(owner.operatorId).select({ name: 1, plan: 1 }).lean();
      sendOperatorInvite({
        to: newUser.email,
        name: newUser.name,
        userId: newUser._id.toString(),
        operatorName: operator?.name,
        planName: operator?.plan,
      }).catch((err) => {
        logger.error("operator.team_invite.mail_failed", { error: err?.message });
      });

      return res.status(201).json({
        user: {
          _id: String(newUser._id),
          email: newUser.email,
          username: newUser.username,
          name: newUser.name,
          status: newUser.status,
        },
        activationUrl: `${process.env.APP_URL || ""}/activate?userId=${newUser._id}`,
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },

  // PATCH /operators/team/:userId — change a brand-scoped teammate's brand
  // set. Owner-only. Can't edit owners or yourself; brands must belong to the
  // operator and at least one is required (emptying would promote to owner).
  updateTeamMember: async (req, res) => {
    try {
      const owner = req.affiliateUser;
      if (owner.role !== "operator" || !owner.operatorId) {
        return res.status(403).json({ error: "Operators only" });
      }
      if (!isOwner(owner)) {
        return res.status(403).json({ error: "owner_only" });
      }

      const { brandIds } = req.body || {};
      if (!Array.isArray(brandIds) || brandIds.length === 0) {
        return res.status(400).json({ error: "Select at least one brand for this user" });
      }

      const target = await User.findOne({
        _id: req.params.userId,
        operatorId: owner.operatorId,
        role: "operator",
      });
      if (!target) return res.status(404).json({ error: "User not found" });
      if (String(target._id) === String(owner._id)) {
        return res.status(400).json({ error: "You cannot edit your own access" });
      }
      if (isOwner(target)) {
        return res.status(400).json({ error: "Cannot scope an owner account here" });
      }

      const ownBrands = await Brand.find({
        _id: { $in: brandIds },
        operatorId: owner.operatorId,
      })
        .select({ _id: 1 })
        .lean();
      if (ownBrands.length !== brandIds.length) {
        return res.status(400).json({ error: "One or more brands are invalid for this operator" });
      }

      target.brandIds = ownBrands.map((b) => b._id);
      await target.save();
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },

  // DELETE /operators/team/:userId — soft-delete a brand-scoped teammate.
  // Owner-only. Won't remove owners or yourself.
  removeTeamMember: async (req, res) => {
    try {
      const owner = req.affiliateUser;
      if (owner.role !== "operator" || !owner.operatorId) {
        return res.status(403).json({ error: "Operators only" });
      }
      if (!isOwner(owner)) {
        return res.status(403).json({ error: "owner_only" });
      }

      const target = await User.findOne({
        _id: req.params.userId,
        operatorId: owner.operatorId,
        role: "operator",
      });
      if (!target) return res.status(404).json({ error: "User not found" });
      if (String(target._id) === String(owner._id)) {
        return res.status(400).json({ error: "You cannot remove yourself" });
      }
      if (isOwner(target)) {
        return res.status(400).json({ error: "Cannot remove an owner account here" });
      }

      target.isDeleted = true;
      await target.save();
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },
};

module.exports = operatorController;
