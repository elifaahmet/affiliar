"use strict";

/**
 * Pure CPA qualification evaluator. No I/O. Takes per-FTD context rows and
 * the resolved gate settings, decides for each FTD whether its CPA should
 * be paid now (qualified), held over (pending), or dropped entirely
 * (rejected). The caller multiplies qualified count × cpa.amountCents to
 * get the CPA portion of commission.
 *
 * An FTD is a single triplet:
 *   { playerId, ftdDate, depositCents, depositFeeCents,
 *     wagerSinceFtdCents, cashoutsSinceFtdCents, depositsTotalCents,
 *     cashoutsTotalCents }
 *
 * `gates` is the resolved CPA qualification subset of resolveCommissionSettings.
 * `now` is the reference timestamp the hold period is measured from
 *   (injected so the function stays pure and testable).
 *
 * Failure classification:
 *   - `rejected` : permanently fails — e.g. deposit below minimum. A later
 *     recalc won't change the outcome unless the operator loosens the gate.
 *   - `pending`  : fails but could pass later — e.g. hold period not met,
 *     wager threshold not yet reached. The next monthly recalc may promote
 *     it to qualified.
 *
 * Priority order of checks (first failure short-circuits):
 *   1. minDepositCents       → rejected (permanent)
 *   2. holdDays              → pending (time-based)
 *   3. minKycLevel           → pending (player can level up later)
 *   4. minWager*             → pending (activity-based)
 *   5. minCashRetention      → pending (can recover if player deposits more)
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function checkCpaQualification(ftds, gates, now = new Date()) {
  const result = {
    qualified: [],
    pending: [],
    rejected: [],
  };

  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();

  for (const ftd of ftds) {
    const decision = evaluate(ftd, gates, nowMs);
    result[decision.bucket].push({ ...ftd, reason: decision.reason });
  }

  return {
    qualified: result.qualified.length,
    pending: result.pending.length,
    rejected: result.rejected.length,
    qualifiedFtds: result.qualified,
    pendingFtds: result.pending,
    rejectedFtds: result.rejected,
  };
}

function evaluate(ftd, gates, nowMs) {
  const depositForGate =
    gates.depositBasis === "net"
      ? Math.max(0, (ftd.depositCents || 0) - (ftd.depositFeeCents || 0))
      : (ftd.depositCents || 0);

  // 1. Minimum deposit — permanent rejection if below threshold.
  if (isActive(gates.minDepositCents) && depositForGate < gates.minDepositCents) {
    return { bucket: "rejected", reason: "deposit_below_min" };
  }

  // 2. Hold period — pending until enough time has passed.
  if (isActive(gates.holdDays)) {
    const ftdMs = ftd.ftdDate instanceof Date
      ? ftd.ftdDate.getTime()
      : new Date(ftd.ftdDate).getTime();
    const ageDays = (nowMs - ftdMs) / MS_PER_DAY;
    if (ageDays < gates.holdDays) {
      return { bucket: "pending", reason: "hold_period_not_met" };
    }
  }

  // 3. KYC tier — pending; player may level up between recalcs.
  // minKycLevel can legitimately be 0 (meaning "any registered player passes"),
  // so `isActive` (which rejects 0) is the wrong check here — use null-aware.
  if (gates.minKycLevel !== null && gates.minKycLevel !== undefined) {
    const playerKyc = Number(ftd.kycLevel) || 0;
    if (playerKyc < gates.minKycLevel) {
      return { bucket: "pending", reason: "kyc_below_min" };
    }
  }

  // 4. Wager gates — flat floor + multiple-of-deposit. Both can be active
  // independently; the effective requirement is the larger of the two.
  const wagerRequired = Math.max(
    isActive(gates.minWagerCents) ? gates.minWagerCents : 0,
    isActive(gates.minWagerMultiple) ? gates.minWagerMultiple * depositForGate : 0,
  );
  if (wagerRequired > 0 && (ftd.wagerSinceFtdCents || 0) < wagerRequired) {
    return { bucket: "pending", reason: "wager_below_min" };
  }

  // 5. Cash-retention — net cash kept on the platform must exceed floor.
  // Catches deposit-then-withdraw patterns. Measured at calc time, so can
  // recover if player deposits more later.
  if (isActive(gates.minCashRetentionCents)) {
    const netCash =
      (ftd.depositsTotalCents || 0) - (ftd.cashoutsTotalCents || 0);
    if (netCash < gates.minCashRetentionCents) {
      return { bucket: "pending", reason: "cash_retention_below_min" };
    }
  }

  return { bucket: "qualified", reason: "ok" };
}

// A gate is "active" only when an explicit non-null, non-zero value is set.
// 0 means "there is no floor" which is identical to null in semantics.
function isActive(v) {
  return v !== null && v !== undefined && v > 0;
}

module.exports = { checkCpaQualification };
