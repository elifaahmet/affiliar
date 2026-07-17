"use strict";

const axios = require("axios");

// The casino player-name resolve endpoint sits next to the bonus catalog
// endpoint (operator's casinoBonusApiUrl). Swap the path suffix rather than
// rebuilding from origin, so any routing prefix (e.g. nginx /api on a separate
// casino server) is preserved.
function playersUrlFrom(bonusUrl) {
  try {
    const u = new URL(bonusUrl);
    const swapped = u.pathname.replace(/\/affiliar-bonus\/definitions\/?$/, "/affiliar-players/resolve");
    u.pathname = swapped.endsWith("/affiliar-players/resolve") ? swapped : "/affiliar-players/resolve";
    u.search = "";
    return u.toString();
  } catch {
    return "";
  }
}

// Resolve player ids → [{ playerId, username }] via the operator's casino.
// Returns [] when not configured. Caller batches.
async function resolveUsernames(cfg, playerIds) {
  const url = playersUrlFrom(cfg?.url);
  if (!url || !cfg?.token || !playerIds?.length) return [];
  const res = await axios.post(
    url,
    { playerIds },
    { timeout: 12000, headers: { "x-affiliar-token": cfg.token } },
  );
  return res.data?.players || [];
}

// Test-account id list endpoint sits next to resolve (same casino base URL).
function testIdsUrlFrom(bonusUrl) {
  try {
    const u = new URL(bonusUrl);
    const swapped = u.pathname.replace(/\/affiliar-bonus\/definitions\/?$/, "/affiliar-players/test-ids");
    u.pathname = swapped.endsWith("/affiliar-players/test-ids") ? swapped : "/affiliar-players/test-ids";
    u.search = "";
    return u.toString();
  } catch {
    return "";
  }
}

// Fetch the casino tenant's test-account player ids. Returns null when the
// casino connection isn't configured; an array (possibly empty) on success.
async function fetchTestIds(cfg) {
  const url = testIdsUrlFrom(cfg?.url);
  if (!url || !cfg?.token) return null;
  const res = await axios.get(url, { timeout: 12000, headers: { "x-affiliar-token": cfg.token } });
  const ids = res.data?.playerIds;
  return Array.isArray(ids) ? ids.map(String) : [];
}

module.exports = { playersUrlFrom, resolveUsernames, testIdsUrlFrom, fetchTestIds };
