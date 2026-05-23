"use strict";

/**
 * Refer-a-Friend reward strategy registry.
 *
 * Each refer-a-friend payout shape lives in its own module so adding a new
 * shape (Crew tiered, match-deposit, tournament pool, …) is a one-file PR:
 *   1) drop a strategy module here (export default function(ctx) -> cents)
 *   2) register it below
 *   3) add the enum value to ReferAFriendConfig.reward.type
 *   4) optionally expose it in the operator UI when the flag's unlocked
 *
 * The shapes that ship today (`fixed_bonus`, `percent_of_first_deposit`)
 * carry the exact math the previous inline `computeReward` had — this
 * refactor is behavior-preserving by design.
 */

const fixedBonus  = require("./fixedBonus");
const percentFtd  = require("./percentFtd");

const STRATEGIES = {
  fixed_bonus:              fixedBonus,
  percent_of_first_deposit: percentFtd,
  // crew_tiered: require("./crewTiered"),   // wired when the Crew build lands
};

/**
 * Compute a reward in cents for one referral.
 *
 * @param {object} rewardConfig  ReferAFriendConfig.reward subdoc (has .type
 *                               plus shape-specific fields)
 * @param {object} ctx           shape-dependent context, e.g. { ftdCents }
 * @returns {number}             non-negative integer cents (0 on bad input)
 */
function compute(rewardConfig, ctx = {}) {
  if (!rewardConfig || !rewardConfig.type) return 0;
  const strategy = STRATEGIES[rewardConfig.type];
  if (!strategy) return 0;          // unknown shape → conservative 0
  const out = strategy(rewardConfig, ctx);
  return Math.max(0, Math.floor(Number(out) || 0));
}

module.exports = { compute, STRATEGIES };
