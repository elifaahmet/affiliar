const clickhouse = require("../../config/clickhouse");
const Brand = require("../../models/Brand");

// Union the product flags across the brands in the report's filter scope.
// FE uses this to hide tiles/columns for products no brand actually
// offers (e.g. a casino-only operator never sees Sportsbook NGR=0).
async function productScopeForReport(operator, query) {
  const filter = { operatorId: operator.operatorId };
  if (query.brandId) filter._id = query.brandId;
  const brands = await Brand.find(filter).select({ products: 1 }).lean();
  if (brands.length === 0) return { casino: true, sportsbook: true };
  const scope = { casino: false, sportsbook: false };
  for (const b of brands) {
    const list = Array.isArray(b.products) && b.products.length
      ? b.products
      : ["casino", "sportsbook"];
    if (list.includes("casino")) scope.casino = true;
    if (list.includes("sportsbook")) scope.sportsbook = true;
  }
  return scope;
}

// ── helpers ────────────────────────────────────────────────────────────────────

/**
 * Convert "YYYY-MM-DD" to a ClickHouse DateTime literal.
 * from = start of day, to = end of day (inclusive).
 */
function chFrom(dateStr) {
  return `${dateStr} 00:00:00`;
}
function chTo(dateStr) {
  return `${dateStr} 23:59:59`;
}

/**
 * Build the WHERE clause conditions shared by all report queries.
 * Returns { conditions: string[], params: Record<string,string> }
 */
function buildWhere(operator, query) {
  const conditions = ["tenant_id = {tenantId:String}"];
  const params = { tenantId: operator.operatorId.toString() };

  if (query.from) {
    conditions.push("from_ts >= {fromTs:DateTime}");
    params.fromTs = chFrom(query.from);
  }
  if (query.to) {
    conditions.push("from_ts <= {toTs:DateTime}");
    params.toTs = chTo(query.to);
  }
  if (query.brandId) {
    conditions.push("brand_id = {brandId:String}");
    params.brandId = query.brandId;
  }
  if (query.affiliateId) {
    conditions.push("affiliate_id = {affiliateId:String}");
    params.affiliateId = query.affiliateId;
  }

  return { conditions, params };
}

/** The SELECT columns for all numeric metrics (used in SUM aggregations) */
const METRIC_COLS = `
  SUM(registrations)                      AS registrations,
  SUM(ftd_count)                          AS ftdCount,
  SUM(ftd_sum_cents)                      AS ftdSumCents,
  SUM(deposits_count)                     AS depositsCount,
  SUM(deposits_sum_cents)                 AS depositsSumCents,
  SUM(cashouts_count)                     AS cashoutsCount,
  SUM(cashouts_sum_cents)                 AS cashoutsSumCents,
  SUM(chargebacks_count)                  AS chargebacksCount,
  SUM(chargebacks_sum_cents)              AS chargebacksSumCents,
  SUM(bets_sum_cents)                     AS betsSumCents,
  SUM(wins_sum_cents)                     AS winsSumCents,
  SUM(casino_bets_rollbacks_sum_cents)    AS casinoBetsRollbacksSumCents,
  SUM(casino_wins_rollbacks_sum_cents)    AS casinoWinsRollbacksSumCents,
  SUM(bonus_issues_sum_cents)             AS bonusIssuesSumCents,
  SUM(additional_deductions_sum_cents)    AS additionalDeductionsSumCents,
  SUM(payment_system_fees_sum_cents)      AS paymentSystemFeesSumCents,
  SUM(jackpot_fees_sum_cents)             AS jackpotFeesSumCents,
  SUM(game_provider_fees_sum_cents)       AS gameProviderFeesSumCents,
  SUM(casino_taxes_sum_cents)             AS casinoTaxesSumCents,
  SUM(rounds_count)                       AS roundsCount,
  SUM(wager_cents)                        AS wagerCents,
  SUM(casino_ggr_cents)                   AS computedGgrCents,
  SUM(casino_ngr_cents)                   AS computedNgrCents,
  -- Sportsbook columns + all three NGR variants so the FE can flip
  -- between product tabs without a re-query.
  SUM(sb_bets_sum_cents)                  AS sbBetsSumCents,
  SUM(sb_cancelled_bets_sum_cents)        AS sbCancelledBetsSumCents,
  SUM(sb_rejected_bets_sum_cents)         AS sbRejectedBetsSumCents,
  SUM(sb_wins_sum_cents)                  AS sbWinsSumCents,
  SUM(sb_win_rollbacks_sum_cents)         AS sbWinRollbacksSumCents,
  SUM(sb_settled_bets_sum_cents)          AS sbSettledBetsSumCents,
  SUM(sb_bonus_issues_sum_cents)          AS sbBonusIssuesSumCents,
  SUM(sb_balance_corrections_sum_cents)   AS sbBalanceCorrectionsSumCents,
  SUM(sb_third_party_fees_sum_cents)      AS sbThirdPartyFeesSumCents,
  SUM(sb_ggr_cents)                       AS sbGgrCents,
  SUM(sb_ngr_cents)                       AS sbNgrCents,
  SUM(combined_ngr_cents)                 AS combinedNgrCents,
  uniqExactIf(player_id, player_id != '__fees__')                    AS playerCount
`.trim();

/** Run a query and return rows as plain JS objects (all values as numbers/strings). */
async function queryRows(sql, queryParams) {
  const result = await clickhouse.query({
    query: sql,
    query_params: queryParams,
    format: "JSONEachRow",
  });
  return result.json();
}

// ── Overview ──────────────────────────────────────────────────────────────────

exports.overview = async (req, res) => {
  const operator = req.affiliateUser;
  if (operator.role !== "operator") {
    return res.status(403).json({ error: "Only operators can access reports" });
  }
  if (!operator.operatorId) {
    return res.status(400).json({ error: "Operator account is not linked to an operator record" });
  }

  const { conditions, params } = buildWhere(operator, req.query);
  const where = conditions.join(" AND ");

  try {
    const [summaryRows, byDayRows] = await Promise.all([
      // Overall totals
      queryRows(
        `SELECT ${METRIC_COLS}
         FROM affiliate.activity
         WHERE ${where}`,
        params,
      ),
      // Daily breakdown
      queryRows(
        `SELECT
           formatDateTime(from_ts, '%Y-%m-%d', 'UTC') AS date,
           ${METRIC_COLS}
         FROM affiliate.activity
         WHERE ${where}
         GROUP BY date
         ORDER BY date ASC`,
        params,
      ),
    ]);

    // ClickHouse returns strings for numbers in JSONEachRow — coerce to Number
    const coerce = (row) =>
      Object.fromEntries(
        Object.entries(row).map(([k, v]) => [k, isNaN(Number(v)) ? v : Number(v)])
      );

    const summary = coerce(
      summaryRows[0] ?? {
        registrations: 0, ftdCount: 0, ftdSumCents: 0,
        depositsCount: 0, depositsSumCents: 0, cashoutsCount: 0, cashoutsSumCents: 0,
        chargebacksCount: 0, chargebacksSumCents: 0, betsSumCents: 0, winsSumCents: 0,
        casinoBetsRollbacksSumCents: 0, casinoWinsRollbacksSumCents: 0,
        bonusIssuesSumCents: 0, additionalDeductionsSumCents: 0,
        paymentSystemFeesSumCents: 0, jackpotFeesSumCents: 0,
        gameProviderFeesSumCents: 0, casinoTaxesSumCents: 0,
        roundsCount: 0, wagerCents: 0, computedGgrCents: 0, computedNgrCents: 0,
        sbBetsSumCents: 0, sbCancelledBetsSumCents: 0, sbRejectedBetsSumCents: 0,
        sbWinsSumCents: 0, sbWinRollbacksSumCents: 0, sbSettledBetsSumCents: 0,
        sbBonusIssuesSumCents: 0, sbBalanceCorrectionsSumCents: 0,
        sbThirdPartyFeesSumCents: 0, sbGgrCents: 0, sbNgrCents: 0, combinedNgrCents: 0,
        playerCount: 0,
      }
    );

    const productScope = await productScopeForReport(operator, req.query);

    return res.json({
      period: { from: req.query.from, to: req.query.to },
      productScope,
      summary,
      byDay: byDayRows.map(coerce),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// ── Affiliates ────────────────────────────────────────────────────────────────

exports.affiliates = async (req, res) => {
  const operator = req.affiliateUser;
  if (operator.role !== "operator") {
    return res.status(403).json({ error: "Only operators can access reports" });
  }
  if (!operator.operatorId) {
    return res.status(400).json({ error: "Operator account is not linked to an operator record" });
  }

  const page    = Math.max(1, parseInt(req.query.page  || "1",  10));
  const limit   = Math.min(200, Math.max(1, parseInt(req.query.limit || "50", 10)));
  const sortDir = req.query.sortDir === "asc" ? "ASC" : "DESC";

  const ALLOWED_SORT = new Set([
    "computedNgrCents", "computedGgrCents", "depositsSumCents", "ftdCount",
    "registrations", "playerCount", "roundsCount",
  ]);
  const sortBy = ALLOWED_SORT.has(req.query.sortBy) ? req.query.sortBy : "computedNgrCents";

  const { conditions, params } = buildWhere(operator, req.query);
  const where = conditions.join(" AND ");

  // ClickHouse aliases can't be used directly in ORDER BY; map to column expression
  const sortColMap = {
    computedNgrCents:  "SUM(casino_ngr_cents)",
    computedGgrCents:  "SUM(casino_ggr_cents)",
    depositsSumCents:  "SUM(deposits_sum_cents)",
    ftdCount:          "SUM(ftd_count)",
    registrations:     "SUM(registrations)",
    playerCount:       "uniqExactIf(player_id, player_id != '__fees__')",
    roundsCount:       "SUM(rounds_count)",
  };

  try {
    const coerce = (row) =>
      Object.fromEntries(
        Object.entries(row).map(([k, v]) => [k, isNaN(Number(v)) ? v : Number(v)])
      );

    const baseSql = `
      SELECT
        affiliate_id   AS affiliateId,
        affiliate_code AS affiliateCode,
        campaign,
        ${METRIC_COLS}
      FROM affiliate.activity
      WHERE ${where}
      GROUP BY affiliate_id, affiliate_code, campaign
    `;

    const [rows, countRows] = await Promise.all([
      queryRows(
        `${baseSql}
         ORDER BY ${sortColMap[sortBy]} ${sortDir}
         LIMIT {limit:UInt32} OFFSET {offset:UInt32}`,
        { ...params, limit, offset: (page - 1) * limit },
      ),
      queryRows(
        `SELECT COUNT() AS total FROM (${baseSql})`,
        params,
      ),
    ]);

    return res.json({
      period: { from: req.query.from, to: req.query.to },
      affiliates: rows.map(coerce),
      total: Number(countRows[0]?.total ?? 0),
      page,
      limit,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// ── Campaigns ────────────────────────────────────────────────────────────────

exports.campaignReport = async (req, res) => {
  const operator = req.affiliateUser;
  if (operator.role !== "operator") {
    return res.status(403).json({ error: "Only operators can access reports" });
  }
  if (!operator.operatorId) {
    return res.status(400).json({ error: "Operator account is not linked to an operator record" });
  }

  const { conditions, params } = buildWhere(operator, req.query);
  if (req.query.campaign) {
    conditions.push("campaign = {campaign:String}");
    params.campaign = req.query.campaign;
  }
  const where = conditions.join(" AND ");

  try {
    const coerce = (row) =>
      Object.fromEntries(
        Object.entries(row).map(([k, v]) => [k, isNaN(Number(v)) ? v : Number(v)])
      );

    const rows = await queryRows(
      `SELECT
         campaign,
         affiliate_id   AS affiliateId,
         affiliate_code AS affiliateCode,
         SUM(registrations)       AS registrations,
         SUM(ftd_count)           AS ftdCount,
         SUM(ftd_sum_cents)       AS ftdSumCents,
         SUM(deposits_count)      AS depositsCount,
         SUM(deposits_sum_cents)  AS depositsSumCents,
         SUM(casino_ggr_cents)    AS ggrCents,
         SUM(casino_ngr_cents)    AS ngrCents,
         uniqExactIf(player_id, player_id != '__fees__')     AS playerCount
       FROM affiliate.activity
       WHERE ${where}
       GROUP BY campaign, affiliate_id, affiliate_code
       ORDER BY SUM(casino_ngr_cents) DESC`,
      params,
    );

    return res.json({
      period: { from: req.query.from, to: req.query.to },
      rows: rows.map(coerce),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.portalCampaignReport = async (req, res) => {
  const user = req.affiliateUser;
  if (user.role !== "affiliate") {
    return res.status(403).json({ error: "Only affiliates can access this endpoint" });
  }
  if (!user.operatorId) {
    return res.status(400).json({ error: "Account is not linked to an operator" });
  }

  const conditions = [
    "tenant_id = {tenantId:String}",
    "affiliate_id = {affiliateId:String}",
  ];
  const params = {
    tenantId: user.operatorId.toString(),
    affiliateId: user._id.toString(),
  };

  if (req.query.from) {
    conditions.push("from_ts >= {fromTs:DateTime}");
    params.fromTs = chFrom(req.query.from);
  }
  if (req.query.to) {
    conditions.push("from_ts <= {toTs:DateTime}");
    params.toTs = chTo(req.query.to);
  }
  if (req.query.campaign) {
    conditions.push("campaign = {campaign:String}");
    params.campaign = req.query.campaign;
  }
  const where = conditions.join(" AND ");

  try {
    const coerce = (row) =>
      Object.fromEntries(
        Object.entries(row).map(([k, v]) => [k, isNaN(Number(v)) ? v : Number(v)])
      );

    const rows = await queryRows(
      `SELECT
         campaign,
         affiliate_id   AS affiliateId,
         affiliate_code AS affiliateCode,
         SUM(registrations)       AS registrations,
         SUM(ftd_count)           AS ftdCount,
         SUM(ftd_sum_cents)       AS ftdSumCents,
         SUM(deposits_count)      AS depositsCount,
         SUM(deposits_sum_cents)  AS depositsSumCents,
         SUM(casino_ggr_cents)    AS ggrCents,
         SUM(casino_ngr_cents)    AS ngrCents,
         uniqExactIf(player_id, player_id != '__fees__')     AS playerCount
       FROM affiliate.activity
       WHERE ${where}
       GROUP BY campaign, affiliate_id, affiliate_code
       ORDER BY SUM(casino_ngr_cents) DESC`,
      params,
    );

    return res.json({
      period: { from: req.query.from, to: req.query.to },
      rows: rows.map(coerce),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// ── Traffic ───────────────────────────────────────────────────────────────────

exports.traffic = async (req, res) => {
  const operator = req.affiliateUser;
  if (operator.role !== "operator") {
    return res.status(403).json({ error: "Only operators can access reports" });
  }
  if (!operator.operatorId) {
    return res.status(400).json({ error: "Operator account is not linked to an operator record" });
  }

  const page  = Math.max(1, parseInt(req.query.page  || "1",   10));
  const limit = Math.min(500, Math.max(1, parseInt(req.query.limit || "100", 10)));

  const { conditions, params } = buildWhere(operator, req.query);
  const where = conditions.join(" AND ");

  try {
    const coerce = (row) =>
      Object.fromEntries(
        Object.entries(row).map(([k, v]) => [k, isNaN(Number(v)) ? v : Number(v)])
      );

    const baseSql = `
      SELECT
        formatDateTime(from_ts, '%Y-%m-%d', 'UTC') AS date,
        affiliate_id                                AS affiliateId,
        affiliate_code                              AS affiliateCode,
        campaign,
        sub_id                                      AS subId,
        SUM(registrations)                          AS registrations,
        SUM(ftd_count)                              AS ftdCount,
        SUM(ftd_sum_cents)                          AS ftdSumCents,
        SUM(deposits_count)                         AS depositsCount,
        SUM(deposits_sum_cents)                     AS depositsSumCents,
        uniqExactIf(player_id, player_id != '__fees__')                        AS playerCount
      FROM affiliate.activity
      WHERE ${where}
      GROUP BY date, affiliate_id, affiliate_code, campaign, sub_id
    `;

    const [rows, countRows] = await Promise.all([
      queryRows(
        `${baseSql}
         ORDER BY date DESC, affiliate_id ASC
         LIMIT {limit:UInt32} OFFSET {offset:UInt32}`,
        { ...params, limit, offset: (page - 1) * limit },
      ),
      queryRows(
        `SELECT COUNT() AS total FROM (${baseSql})`,
        params,
      ),
    ]);

    return res.json({
      period: { from: req.query.from, to: req.query.to },
      rows: rows.map(coerce),
      total: Number(countRows[0]?.total ?? 0),
      page,
      limit,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
