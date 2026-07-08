"use strict";

// Monthly Active Players (MAP) — the plan's value/cost metric. Distinct
// player_id with any activity in the current calendar month (UTC), scoped to
// the operator's tenant, excluding the __fees__ rollup sentinel and test
// players. Cost scales with players/events (ClickHouse + Kafka), not with
// affiliate seats, so MAP is what the subscription caps.

const clickhouse = require("../config/clickhouse");
const { testExclusion } = require("./testPlayers");

function monthStartUTC(now = new Date()) {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01 00:00:00`;
}

async function getMonthlyActivePlayers(operatorId) {
  const tenantId = String(operatorId);
  const tf = await testExclusion(operatorId, { includeTest: false });
  const sql = `
    SELECT uniqExact(player_id) AS map
    FROM affiliate.activity
    WHERE tenant_id = {tenantId:String}
      AND from_ts >= {monthStart:DateTime}
      AND player_id != '__fees__'
      ${tf.cond ? `AND ${tf.cond}` : ""}
  `;
  const res = await clickhouse.query({
    query: sql,
    query_params: { tenantId, monthStart: monthStartUTC(), ...tf.params },
    format: "JSONEachRow",
  });
  const rows = await res.json();
  return Number(rows?.[0]?.map) || 0;
}

module.exports = { getMonthlyActivePlayers };
