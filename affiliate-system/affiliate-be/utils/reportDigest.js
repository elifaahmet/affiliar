"use strict";

// Weekly report digest data — a compact operator pulse pulled from the same
// ClickHouse `affiliate.activity` view the Reports page uses. Test players are
// excluded, matching the in-app default. Returns headline metrics + the top 3
// affiliates by NGR for a [fromTs, toTs] window.

const clickhouse = require("../config/clickhouse");
const { testExclusion } = require("./testPlayers");

async function q(sql, params) {
  const res = await clickhouse.query({ query: sql, query_params: params, format: "JSONEachRow" });
  return res.json();
}

async function getOperatorSummary(operatorId, fromTs, toTs) {
  const tenantId = String(operatorId);
  const tf = await testExclusion(operatorId, { includeTest: false });
  const testCond = tf.cond ? `AND ${tf.cond}` : "";
  const params = { tenantId, fromTs, toTs, ...tf.params };

  const totalsSql = `
    SELECT
      SUM(registrations)          AS registrations,
      SUM(ftd_count)              AS ftdCount,
      SUM(ftd_sum_cents)          AS ftdSumCents,
      SUM(deposits_sum_cents)     AS depositsSumCents,
      SUM(combined_ngr_cents)     AS ngrCents,
      SUM(casino_ggr_cents)       AS ggrCents,
      uniqExactIf(player_id, player_id != '__fees__') AS activePlayers
    FROM affiliate.activity
    WHERE tenant_id = {tenantId:String}
      AND from_ts >= {fromTs:DateTime} AND from_ts <= {toTs:DateTime} ${testCond}
  `;
  const topSql = `
    SELECT affiliate_id AS affiliateId, any(affiliate_code) AS code,
           SUM(combined_ngr_cents) AS ngrCents, SUM(ftd_count) AS ftdCount
    FROM affiliate.activity
    WHERE tenant_id = {tenantId:String}
      AND from_ts >= {fromTs:DateTime} AND from_ts <= {toTs:DateTime}
      AND affiliate_id != '' ${testCond}
    GROUP BY affiliate_id ORDER BY ngrCents DESC LIMIT 3
  `;

  const [totalsRows, topRows] = await Promise.all([q(totalsSql, params), q(topSql, params)]);
  const t = totalsRows[0] || {};
  const n = (v) => Number(v) || 0;
  return {
    registrations:    n(t.registrations),
    ftdCount:         n(t.ftdCount),
    ftdSumCents:      n(t.ftdSumCents),
    depositsSumCents: n(t.depositsSumCents),
    ngrCents:         n(t.ngrCents),
    ggrCents:         n(t.ggrCents),
    activePlayers:    n(t.activePlayers),
    topAffiliates: topRows.map((r) => ({
      code: r.code || String(r.affiliateId),
      ngrCents: n(r.ngrCents),
      ftdCount: n(r.ftdCount),
    })),
  };
}

// True when the window has anything worth emailing about.
function hasActivity(s) {
  return !!(s.registrations || s.ftdCount || s.depositsSumCents || s.ngrCents || s.activePlayers);
}

module.exports = { getOperatorSummary, hasActivity };
