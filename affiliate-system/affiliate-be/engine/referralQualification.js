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
function evaluateGates({
  ftdCents, ftdAt, gates, wagerSinceFtdCents,
  // Crew active-player snapshot. Optional — older callers can skip and
  // the new gates won't fire (only active when the corresponding config
  // value is set anyway).
  refereeSnapshot,
  now = new Date(),
}) {
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const deposit = Number(ftdCents) || 0;
  const wager   = Number(wagerSinceFtdCents) || 0;
  const snap = refereeSnapshot || {};

  // 1. Minimum deposit — permanent rejection if below floor.
  if (isActive(gates.minDepositCents) && deposit < gates.minDepositCents) {
    return { decision: "rejected", reason: "min_deposit_not_met" };
  }

  // 2. Fraud flag — permanent rejection. Operator can clear the flag in
  // their own system and re-emit `player.flagged` with flag=active to
  // unblock; manual replay of the referral is the path back in.
  if (snap.fraudFlagged) {
    return { decision: "rejected", reason: "player_flagged" };
  }

  // 3. Hold period — pending until enough time has elapsed since FTD.
  if (isActive(gates.holdDays)) {
    const ftdMs = ftdAt instanceof Date ? ftdAt.getTime() : new Date(ftdAt).getTime();
    const ageDays = (nowMs - ftdMs) / MS_PER_DAY;
    if (ageDays < gates.holdDays) {
      return { decision: "pending", reason: "hold_period_not_met" };
    }
  }

  // 4. Account age — pending until the referee's AffiliatePlayer.registeredAt
  // is old enough. If we don't have a snapshot age (unknown), let it pass
  // — better than blocking on missing data.
  if (isActive(gates.minAccountAgeDays) && snap.accountAgeDays != null) {
    if (snap.accountAgeDays < gates.minAccountAgeDays) {
      return { decision: "pending", reason: "account_too_young" };
    }
  }

  // 5. Min deposit count (Crew "active player" rule). Deposit *count*, not
  // amount — that one's minDepositCents above.
  if (isActive(gates.minActiveDeposits)) {
    if ((Number(snap.depositsCount) || 0) < gates.minActiveDeposits) {
      return { decision: "pending", reason: "deposit_count_too_low" };
    }
  }

  // 6. Wager gates — flat floor + multiple-of-deposit. Both can be active
  // independently; effective requirement is whichever is higher.
  const wagerRequired = Math.max(
    isActive(gates.minWagerCents)    ? gates.minWagerCents : 0,
    isActive(gates.minWagerMultiple) ? gates.minWagerMultiple * deposit : 0,
  );
  if (wagerRequired > 0 && wager < wagerRequired) {
    return { decision: "pending", reason: "wager_floor_not_met" };
  }

  // 7. Positive NGR — operator wants only profitable referees in the crew.
  if (gates.requirePositiveNgr && (Number(snap.lifetimeNgrCents) || 0) <= 0) {
    return { decision: "pending", reason: "ngr_not_positive" };
  }

  return { decision: "qualified", reason: "ok" };
}

/**
 * Compute the reward in cents from the resolved reward config and the
 * referee's FTD. Returns 0 for malformed config (defensive).
 *
 * Thin wrapper around `engine/raReward` so the strategy registry handles
 * the actual math — keeps the call sites unchanged while letting new
 * shapes (crew_tiered, match-deposit, …) drop into ./raReward/ without
 * touching this file.
 */
const raReward = require("./raReward");

function computeReward(rewardConfig, ftdCents) {
  return raReward.compute(rewardConfig, { ftdCents });
}

// A gate is "active" only when an explicit non-null, non-zero value is set.
// 0 and null/undefined both mean "no floor".
function isActive(v) {
  return v !== null && v !== undefined && v > 0;
}

module.exports = { evaluateGates, computeReward };
