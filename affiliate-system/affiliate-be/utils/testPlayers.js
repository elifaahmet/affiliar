"use strict";

// ── Test-account exclusion helper ────────────────────────────────────────────
//
// Test players are marked on AffiliatePlayer (isTest) — either by the operator
// from the players UI, or by a `player.flagged` flag="test" event. They must be
// excluded from NGR/GGR/FTD reporting and never earn commission.
//
// Because NGR lives in ClickHouse (append-only SummingMergeTree deltas) and a
// player can be marked test AFTER their events landed, we exclude at QUERY time
// by player_id — this reflects mark/unmark retroactively with no CH schema
// change or backfill. Test accounts are a small set, so `player_id NOT IN (…)`
// stays cheap.

const AffiliatePlayer = require("../models/AffiliatePlayer");

// The operator's test playerIds as strings. Empty array when none.
async function getTestPlayerIds(operatorId) {
  if (!operatorId) return [];
  const ids = await AffiliatePlayer.find({ operatorId, isTest: true })
    .distinct("playerId");
  return ids.map(String);
}

// Truthy only when the request explicitly asks to include test players.
function parseIncludeTest(query) {
  return String(query?.includeTest ?? "").toLowerCase() === "true";
}

// Build a ClickHouse WHERE predicate that excludes the operator's test players.
// Returns { cond, params } where `cond` is "" when there is nothing to exclude
// (include=true, or the operator has no test players). `column` lets callers
// target an aliased player_id (e.g. "a.player_id") inside a JOIN. The param is
// namespaced (__testIds) so it never clashes with a query's own params.
async function testExclusion(operatorId, { includeTest = false, column = "player_id" } = {}) {
  if (includeTest) return { cond: "", params: {} };
  const ids = await getTestPlayerIds(operatorId);
  if (!ids.length) return { cond: "", params: {} };
  return {
    cond: `${column} NOT IN {__testIds:Array(String)}`,
    params: { __testIds: ids },
  };
}

module.exports = { getTestPlayerIds, parseIncludeTest, testExclusion };
