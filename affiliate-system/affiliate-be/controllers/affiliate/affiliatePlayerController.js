const AffiliatePlayer = require("../../models/AffiliatePlayer");
const User = require("../../models/User");
const clickhouse = require("../../config/clickhouse");

async function queryRows(sql, queryParams) {
  const result = await clickhouse.query({
    query: sql,
    query_params: queryParams,
    format: "JSONEachRow",
  });
  return result.json();
}

/**
 * Batch lookup of per-player lifetime metrics from ClickHouse.
 * Returns a Map<playerId, metrics>.
 */
async function fetchPlayerMetrics(tenantId, playerIds) {
  if (!playerIds?.length) return new Map();
  const rows = await queryRows(
    `SELECT
       player_id AS playerId,
       SUM(deposits_count)         AS depositsCount,
       SUM(deposits_sum_cents)     AS depositsSumCents,
       SUM(ftd_count)              AS ftdCount,
       SUM(ftd_sum_cents)          AS ftdSumCents,
       SUM(cashouts_count)         AS cashoutsCount,
       SUM(cashouts_sum_cents)     AS cashoutsSumCents,
       SUM(chargebacks_count)      AS chargebacksCount,
       SUM(chargebacks_sum_cents)  AS chargebacksSumCents,
       SUM(bets_sum_cents)         AS betsSumCents,
       SUM(wins_sum_cents)         AS winsSumCents,
       SUM(wager_cents)            AS wagerCents,
       SUM(rounds_count)           AS roundsCount,
       SUM(bonus_issues_sum_cents) AS bonusIssuesSumCents,
       SUM(casino_ggr_cents)       AS ggrCents,
       SUM(casino_ngr_cents)       AS ngrCents,
       max(from_ts)                AS lastActivityAt
     FROM affiliate.activity
     WHERE tenant_id = {tenantId:String}
       AND player_id IN {playerIds:Array(String)}
     GROUP BY player_id`,
    { tenantId, playerIds },
  );

  const map = new Map();
  for (const row of rows) {
    const entry = {};
    for (const [k, v] of Object.entries(row)) {
      entry[k] = k === "lastActivityAt" ? v : Number(v);
    }
    map.set(row.playerId, entry);
  }
  return map;
}

const affiliatePlayerController = {
  // GET /players
  async list(req, res) {
    try {
      const user = req.affiliateUser;
      if (!["operator", "affiliate"].includes(user.role)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const {
        affiliateCode,
        affiliateId,
        playerId,
        from,
        to,
        page = 1,
        limit = 50,
      } = req.query;

      const filter = { operatorId: user.operatorId };

      // Affiliates only see their own players; operator filter is optional.
      if (user.role === "affiliate") {
        filter.affiliateId = user._id;
      } else if (affiliateId) {
        filter.affiliateId = affiliateId;
      }

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

      // Enrich with ClickHouse lifetime metrics for the current page
      const playerIds = players.map((p) => String(p.playerId));
      const metrics = await fetchPlayerMetrics(
        user.operatorId.toString(),
        playerIds,
      );

      const enriched = players.map((p) => ({
        ...p,
        metrics: metrics.get(String(p.playerId)) || null,
      }));

      res.json({ players: enriched, total, page: Number(page), limit: Number(limit) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  // GET /players/:playerId — player registry row + lifetime metrics
  async detail(req, res) {
    try {
      const user = req.affiliateUser;
      if (!["operator", "affiliate"].includes(user.role)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const { playerId } = req.params;
      if (!playerId) {
        return res.status(400).json({ error: "playerId is required" });
      }

      const query = {
        operatorId: user.operatorId,
        playerId: String(playerId),
      };
      if (user.role === "affiliate") {
        query.affiliateId = user._id;
      }

      const player = await AffiliatePlayer.findOne(query)
        .populate("affiliateId", "username email name")
        .lean();

      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      const metricsMap = await fetchPlayerMetrics(
        user.operatorId.toString(),
        [String(playerId)],
      );

      res.json({
        ...player,
        metrics: metricsMap.get(String(playerId)) || null,
      });
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
