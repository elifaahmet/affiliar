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
// Per-player metric columns (shared by the enrich-by-page path and the
// metric-sorted CH-driven path).
const PLAYER_METRIC_COLS = `
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
`;

// Sortable metric → ClickHouse ORDER BY expression.
const PLAYER_SORTS = {
  ngrCents:         "SUM(casino_ngr_cents)",
  ggrCents:         "SUM(casino_ggr_cents)",
  depositsSumCents: "SUM(deposits_sum_cents)",
  depositsCount:    "SUM(deposits_count)",
  ftdSumCents:      "SUM(ftd_sum_cents)",
  wagerCents:       "SUM(wager_cents)",
  cashoutsSumCents: "SUM(cashouts_sum_cents)",
  lastActivityAt:   "max(from_ts)",
};

function coerceMetricRow(row) {
  const entry = {};
  for (const [k, v] of Object.entries(row)) {
    entry[k] = k === "lastActivityAt" || k === "playerId" ? v : Number(v);
  }
  return entry;
}

async function fetchPlayerMetrics(tenantId, playerIds) {
  if (!playerIds?.length) return new Map();
  const rows = await queryRows(
    `SELECT player_id AS playerId, ${PLAYER_METRIC_COLS}
     FROM affiliate.activity
     WHERE tenant_id = {tenantId:String}
       AND player_id IN {playerIds:Array(String)}
     GROUP BY player_id`,
    { tenantId, playerIds },
  );

  const map = new Map();
  for (const row of rows) map.set(row.playerId, coerceMetricRow(row));
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
        campaign,
        from,
        to,
        sortBy,
        sortDir,
        page = 1,
        limit = 50,
      } = req.query;
      const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
      const off = (Math.max(Number(page), 1) - 1) * lim;
      const dir = sortDir === "asc" ? "ASC" : "DESC";

      // ── Metric-sorted path: order + paginate in ClickHouse (the metric isn't
      // in Mongo), then hydrate the AffiliatePlayer rows for the page. ──────
      if (PLAYER_SORTS[sortBy]) {
        const conds = ["tenant_id = {tenantId:String}", "player_id != '__fees__'", "affiliate_id != ''"];
        const cp = { tenantId: user.operatorId.toString() };
        if (user.role === "affiliate") { conds.push("affiliate_id = {affId:String}"); cp.affId = String(user._id); }
        else if (affiliateId)          { conds.push("affiliate_id = {affId:String}"); cp.affId = String(affiliateId); }
        if (user.role === "operator" && Array.isArray(user.brandIds) && user.brandIds.length > 0) {
          conds.push("brand_id IN ({brandIds:Array(String)})"); cp.brandIds = user.brandIds.map(String);
        }
        if (affiliateCode) { conds.push("affiliate_code = {code:String}"); cp.code = affiliateCode.toUpperCase(); }
        if (campaign)      { conds.push("campaign = {campaign:String}"); cp.campaign = campaign; }
        if (playerId)      { conds.push("player_id LIKE {pid:String}"); cp.pid = `%${playerId}%`; }
        if (from)          { conds.push("from_ts >= {fromTs:DateTime}"); cp.fromTs = `${from} 00:00:00`; }
        if (to)            { conds.push("from_ts <= {toTs:DateTime}");   cp.toTs = `${to} 23:59:59`; }
        const chWhere = conds.join(" AND ");

        const [metricRows, totalRows] = await Promise.all([
          queryRows(
            `SELECT player_id AS playerId, ${PLAYER_METRIC_COLS}
             FROM affiliate.activity WHERE ${chWhere}
             GROUP BY player_id
             ORDER BY ${PLAYER_SORTS[sortBy]} ${dir}
             LIMIT {lim:UInt32} OFFSET {off:UInt32}`,
            { ...cp, lim, off },
          ),
          queryRows(`SELECT uniqExact(player_id) AS total FROM affiliate.activity WHERE ${chWhere}`, cp),
        ]);

        const ids = metricRows.map((r) => String(r.playerId));
        const docs = ids.length
          ? await AffiliatePlayer.find({ operatorId: user.operatorId, playerId: { $in: ids } })
              .populate("affiliateId", "username email name")
              .lean()
          : [];
        const docById = new Map(docs.map((d) => [String(d.playerId), d]));
        const players = metricRows.map((r) => ({
          ...(docById.get(String(r.playerId)) || { playerId: String(r.playerId) }),
          playerId: String(r.playerId),
          metrics: coerceMetricRow(r),
        }));

        return res.json({
          players,
          total: Number(totalRows?.[0]?.total) || 0,
          page: Number(page),
          limit: lim,
        });
      }

      const filter = { operatorId: user.operatorId };

      // Affiliates only see their own players; operator filter is optional.
      if (user.role === "affiliate") {
        filter.affiliateId = user._id;
      } else if (affiliateId) {
        filter.affiliateId = affiliateId;
      }

      // Brand-scoped operator users only see players attributed to their
      // brands. AffiliatePlayer.brandId is the Brand._id as a string (same
      // convention as the ClickHouse brand_id), so compare against the
      // stringified brandIds. Players with no brandId stay hidden from them.
      if (user.role === "operator" && Array.isArray(user.brandIds) && user.brandIds.length > 0) {
        filter.brandId = { $in: user.brandIds.map(String) };
      }

      if (affiliateCode) filter.affiliateCode = affiliateCode.toUpperCase();
      if (campaign)      filter.campaign = campaign;
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
