"use strict";

const axios = require("axios");

// The casino player-name resolve endpoint lives on the same host as the bonus
// catalog endpoint (operator's casinoBonusApiUrl). Derive it from that URL's
// origin so operators only configure one casino base.
function playersUrlFrom(bonusUrl) {
  try {
    return `${new URL(bonusUrl).origin}/affiliar-players/resolve`;
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

module.exports = { playersUrlFrom, resolveUsernames };
