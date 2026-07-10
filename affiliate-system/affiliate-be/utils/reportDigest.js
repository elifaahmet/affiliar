"use strict";

// Weekly report digest data — a compact operator pulse pulled from the same
// ClickHouse `affiliate.activity` view the Reports page uses. Test players are
// excluded, matching the in-app default. Returns headline metrics + the top 3
// affiliates by NGR for a [fromTs, toTs] window.

const clickhouse = require("../config/clickhouse");
const CommissionReport = require("../models/CommissionReport");
const { testExclusion } = require("./testPlayers");

async function q(sql, params) {
  const res = await clickhouse.query({ query: sql, query_params: params, format: "JSONEachRow" });
  return res.json();
}

const N = (v) => Number(v) || 0;

// Shared headline totals for a scope (operator-wide or one affiliate).
async function totalsFor(operatorId, fromTs, toTs, affiliateId) {
  const tenantId = String(operatorId);
  const tf = await testExclusion(operatorId, { includeTest: false });
  const conds = [
    "tenant_id = {tenantId:String}",
    "from_ts >= {fromTs:DateTime}",
    "from_ts <= {toTs:DateTime}",
  ];
  const params = { tenantId, fromTs, toTs, ...tf.params };
  if (affiliateId) { conds.push("affiliate_id = {affId:String}"); params.affId = String(affiliateId); }
  if (tf.cond) conds.push(tf.cond);
  const rows = await q(`
    SELECT
      SUM(registrations)          AS registrations,
      SUM(ftd_count)              AS ftdCount,
      SUM(ftd_sum_cents)          AS ftdSumCents,
      SUM(deposits_sum_cents)     AS depositsSumCents,
      SUM(combined_ngr_cents)     AS ngrCents,
      SUM(casino_ggr_cents)       AS ggrCents,
      uniqExactIf(player_id, player_id != '__fees__') AS activePlayers
    FROM affiliate.activity
    WHERE ${conds.join(" AND ")}
  `, params);
  const t = rows[0] || {};
  return {
    registrations: N(t.registrations), ftdCount: N(t.ftdCount), ftdSumCents: N(t.ftdSumCents),
    depositsSumCents: N(t.depositsSumCents), ngrCents: N(t.ngrCents), ggrCents: N(t.ggrCents),
    activePlayers: N(t.activePlayers),
  };
}

// One affiliate's own weekly/monthly pulse (no top-affiliates list).
async function getAffiliateSummary(operatorId, affiliateId, fromTs, toTs) {
  return totalsFor(operatorId, fromTs, toTs, affiliateId);
}

// Commission earned in a calendar month (breakdown.totalCents). Operator-wide
// when affiliateId is omitted, else that affiliate's own earnings.
async function getCommissionCents(operatorId, year, month, affiliateId) {
  const match = { operatorId, "period.year": year, "period.month": month };
  if (affiliateId) match.affiliateId = affiliateId;
  const rows = await CommissionReport.aggregate([
    { $match: match },
    { $group: { _id: null, total: { $sum: "$breakdown.totalCents" } } },
  ]);
  return N(rows?.[0]?.total);
}

async function getOperatorSummary(operatorId, fromTs, toTs) {
  const tenantId = String(operatorId);
  const tf = await testExclusion(operatorId, { includeTest: false });
  const testCond = tf.cond ? `AND ${tf.cond}` : "";
  const [totals, topRows] = await Promise.all([
    totalsFor(operatorId, fromTs, toTs),
    q(`
      SELECT affiliate_id AS affiliateId, any(affiliate_code) AS code,
             SUM(combined_ngr_cents) AS ngrCents, SUM(ftd_count) AS ftdCount
      FROM affiliate.activity
      WHERE tenant_id = {tenantId:String}
        AND from_ts >= {fromTs:DateTime} AND from_ts <= {toTs:DateTime}
        AND affiliate_id != '' ${testCond}
      GROUP BY affiliate_id ORDER BY ngrCents DESC LIMIT 3
    `, { tenantId, fromTs, toTs, ...tf.params }),
  ]);
  return {
    ...totals,
    topAffiliates: topRows.map((r) => ({
      code: r.code || String(r.affiliateId), ngrCents: N(r.ngrCents), ftdCount: N(r.ftdCount),
    })),
  };
}

// True when the window has anything worth emailing about.
function hasActivity(s) {
  return !!(s.registrations || s.ftdCount || s.depositsSumCents || s.ngrCents || s.activePlayers);
}

module.exports = { getOperatorSummary, getAffiliateSummary, getCommissionCents, hasActivity };
