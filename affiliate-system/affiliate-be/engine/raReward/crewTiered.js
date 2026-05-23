"use strict";

/**
 * Crew refer-a-friend strategy.
 *
 * Ongoing monthly payout where the referrer's earnings rate climbs with the
 * size of their active crew. The tier table (`crewLevels`) is sorted
 * ascending by `activeReferrals`; the strategy picks the highest row whose
 * threshold the current count meets, and returns floor(NGR × percent / 100).
 *
 * Below the lowest threshold the referrer earns nothing — they haven't yet
 * recruited enough active friends to clear the first level. This is the
 * intentional "make your crew" mechanic.
 *
 * @param {object} rewardConfig
 *   - crewLevels: [{ activeReferrals, percent }, ...]  unsorted is fine
 *   - crewMonthlyCapCents: optional cap on the monthly payout
 * @param {object} ctx
 *   - ctx.activeReferralsCount: how many active referrals the referrer has
 *   - ctx.ngrCents:             the referee's NGR for the period
 * @returns {number} cents (caller clamps and floors)
 */
module.exports = function crewTiered(rewardConfig, ctx) {
  const ngr = Number(ctx.ngrCents) || 0;
  const count = Number(ctx.activeReferralsCount) || 0;
  if (ngr <= 0) return 0;

  const levels = Array.isArray(rewardConfig.crewLevels) ? rewardConfig.crewLevels : [];
  if (levels.length === 0) return 0;

  // Highest threshold whose activeReferrals <= count. Sort defensively in
  // case the operator typed them in any order in the UI.
  const sorted = [...levels].sort((a, b) => a.activeReferrals - b.activeReferrals);
  let percent = 0;
  for (const lvl of sorted) {
    if (count >= (Number(lvl.activeReferrals) || 0)) {
      percent = Number(lvl.percent) || 0;
    } else {
      break;
    }
  }
  if (percent <= 0) return 0;

  let raw = Math.floor((ngr * percent) / 100);
  const cap = rewardConfig.crewMonthlyCapCents;
  if (cap !== null && cap !== undefined && cap > 0 && raw > cap) {
    raw = cap;
  }
  return raw;
};
