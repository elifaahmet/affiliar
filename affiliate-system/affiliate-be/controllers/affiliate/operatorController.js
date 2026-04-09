const Operator = require("../../models/Operator");
const User = require("../../models/User");
const { getPlan } = require("../../utils/planLimits");

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

      const planKey = operator.plan || "starter";
      const plan = getPlan(planKey);

      return res.json({ plan: planKey, limits: plan });
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
};

module.exports = operatorController;
