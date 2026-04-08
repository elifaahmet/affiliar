const AffiliatePlayer = require("../../models/AffiliatePlayer");
const User = require("../../models/User");

const affiliatePlayerController = {
  // GET /players
  async list(req, res) {
    try {
      const operator = req.affiliateUser;
      if (operator.role !== "operator") {
        return res.status(403).json({ error: "Only operators can list players" });
      }

      const {
        affiliateCode,
        playerId,
        from,
        to,
        page = 1,
        limit = 50,
      } = req.query;

      const filter = { operatorId: operator.operatorId };

      if (affiliateCode) filter.affiliateCode = affiliateCode.toUpperCase();
      if (playerId)      filter.playerId = { $regex: playerId, $options: "i" };

      if (from || to) {
        filter.registeredAt = {};
        if (from) filter.registeredAt.$gte = new Date(from);
        if (to)   filter.registeredAt.$lte = new Date(to + "T23:59:59Z");
      }

      const skip = (Number(page) - 1) * Number(limit);

      const [players, total] = await Promise.all([
        AffiliatePlayer.find(filter)
          .populate("affiliateId", "username email name")
          .sort({ importedAt: -1 })
          .skip(skip)
          .limit(Number(limit))
          .lean(),
        AffiliatePlayer.countDocuments(filter),
      ]);

      res.json({ players, total, page: Number(page), limit: Number(limit) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  // GET /players/affiliates-select — dropdown list of affiliates for filter
  async affiliatesSelect(req, res) {
    try {
      const operator = req.affiliateUser;
      if (operator.role !== "operator") {
        return res.status(403).json({ error: "Only operators can access this" });
      }

      const affiliates = await User.find({
        role: "affiliate",
        operatorId: operator.operatorId,
        isDeleted: false,
      })
        .select("_id username email")
        .sort({ username: 1 })
        .lean();

      res.json(affiliates);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
};

module.exports = affiliatePlayerController;
