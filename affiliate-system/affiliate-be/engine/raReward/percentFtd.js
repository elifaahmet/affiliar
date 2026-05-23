"use strict";

/**
 * Percentage of the referee's first deposit, optionally capped.
 *
 * No FX normalization here — the FTD currency is treated as the reward
 * currency. Operators who want exact-EUR percent calcs across currencies
 * should normalize their FTDs upstream before track-ftd hits us.
 *
 * @param {object} rewardConfig    expects { percent, capCents }
 * @param {object} ctx             expects { ftdCents }
 * @returns {number}               cents (caller clamps and floors)
 */
module.exports = function percentFtd(rewardConfig, ctx) {
  const ftd = Number(ctx.ftdCents) || 0;
  const pct = Number(rewardConfig.percent) || 0;
  let raw = Math.floor((ftd * pct) / 100);
  const cap = rewardConfig.capCents;
  if (cap !== null && cap !== undefined && cap > 0 && raw > cap) {
    raw = cap;
  }
  return raw;
};
