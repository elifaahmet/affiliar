"use strict";

/**
 * Pure qualification + reward math for player-to-player referrals.
 * No I/O. The orchestrator (referralEngine.js) handles all DB reads /
 * writes and ClickHouse fetches; this module decides only:
 *
 *   1. Given an FTD'd referral, the configured gates, the player's
 *      cumulative wager since FTD, and `now` — does it pass, hold,
 *      or fail outright?
 *   2. Given a passing referral and the reward shape, what amount?
 *
 * Compile-time decoupled from cpaQualification.js so the affiliate
 * program's gate logic can evolve without breaking refer-a-friend
 * (and vice versa). The bucket semantics deliberately match:
 *
 *   - `rejected` : permanent failure (deposit below min, cap exceeded).
 *                  A later re-evaluation won't change the outcome.
 *   - `pending`  : not failed, not yet passed (hold period not elapsed,
 *                  wager floor not yet reached). Re-evaluate later.
 *   - `qualified`: all gates clear, ready to enqueue reward delivery.
 *
 * Priority of checks (first failure short-circuits):
 *   1. minDepositCents      → rejected (permanent)
 *   2. holdDays             → pending  (time-based)
 *   3. minWager*            → pending  (activity-based)
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * @param {object} args
 * @param {number} args.ftdCents             referee's first deposit, cents
 * @param {Date|string} args.ftdAt           when the FTD happened
 * @param {object} args.gates                ReferAFriendConfig.qualification subdoc
 * @param {number} args.wagerSinceFtdCents   cumulative wager between ftdAt and now
 * @param {Date|number} [args.now=new Date()]
 * @returns {{ decision: 'qualified'|'pending'|'rejected', reason: string }}
 */
function evaluateGates({ ftdCents, ftdAt, gates, wagerSinceFtdCents, now = new Date() }) {
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const deposit = Number(ftdCents) || 0;
  const wager   = Number(wagerSinceFtdCents) || 0;

  // 1. Minimum deposit — permanent rejection if below floor.
  if (isActive(gates.minDepositCents) && deposit < gates.minDepositCents) {
    return { decision: "rejected", reason: "min_deposit_not_met" };
  }

  // 2. Hold period — pending until enough time has elapsed since FTD.
  if (isActive(gates.holdDays)) {
    const ftdMs = ftdAt instanceof Date ? ftdAt.getTime() : new Date(ftdAt).getTime();
    const ageDays = (nowMs - ftdMs) / MS_PER_DAY;
    if (ageDays < gates.holdDays) {
      return { decision: "pending", reason: "hold_period_not_met" };
    }
  }

  // 3. Wager gates — flat floor + multiple-of-deposit. Both can be active
  // independently; effective requirement is whichever is higher.
  const wagerRequired = Math.max(
    isActive(gates.minWagerCents)    ? gates.minWagerCents : 0,
    isActive(gates.minWagerMultiple) ? gates.minWagerMultiple * deposit : 0,
  );
  if (wagerRequired > 0 && wager < wagerRequired) {
    return { decision: "pending", reason: "wager_floor_not_met" };
  }

  return { decision: "qualified", reason: "ok" };
}

/**
 * Compute the reward in cents from the resolved reward config and the
 * referee's FTD. Returns 0 for malformed config (defensive).
 *
 * For percent_of_first_deposit, the FTD currency is treated as the
 * reward currency — Phase 1 ships without FX normalization; operators
 * who want exact-EUR percent calcs should normalize their FTDs upstream.
 *
 * @param {object} rewardConfig  ReferAFriendConfig.reward subdoc
 * @param {number} ftdCents
 * @returns {number} reward cents (clamped >= 0)
 */
function computeReward(rewardConfig, ftdCents) {
  if (!rewardConfig) return 0;
  const ftd = Number(ftdCents) || 0;

  if (rewardConfig.type === "fixed_bonus") {
    return Math.max(0, Number(rewardConfig.amountCents) || 0);
  }

  if (rewardConfig.type === "percent_of_first_deposit") {
    const pct = Number(rewardConfig.percent) || 0;
    let raw = Math.floor((ftd * pct) / 100);
    if (isActive(rewardConfig.capCents) && raw > rewardConfig.capCents) {
      raw = rewardConfig.capCents;
    }
    return Math.max(0, raw);
  }

  return 0;
}

// A gate is "active" only when an explicit non-null, non-zero value is set.
// 0 and null/undefined both mean "no floor".
function isActive(v) {
  return v !== null && v !== undefined && v > 0;
}

module.exports = { evaluateGates, computeReward };
