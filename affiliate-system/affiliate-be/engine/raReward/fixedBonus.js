"use strict";

/**
 * Flat-cents reward — operator pays `amountCents` for every qualified
 * referral, regardless of FTD size or any other context. The simplest
 * shape; everything else just gets fancier than this.
 *
 * @param {object} rewardConfig  expects { amountCents }
 * @returns {number}             cents (caller clamps and floors)
 */
module.exports = function fixedBonus(rewardConfig) {
  return Number(rewardConfig.amountCents) || 0;
};
