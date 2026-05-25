"use strict";

/**
 * Pure per-player qualification evaluator for `fixed`-type commission plans.
 *
 * Takes a list of per-player rows (each carries lifetime cumulative metrics
 * up to the period end), the resolved fixed-plan gates, and the set of
 * player IDs already paid in earlier periods. Returns the IDs of players
 * who cross EVERY gate for the first time → these earn the affiliate one
 * unit of `fixed.amountCents` in this period.
 *
 * Each row is:
 *   { affiliateId, playerId, ftdDate,
 *     depositsCount, depositsTotalCents, cashoutsTotalCents,
 *     wagerCents, ngrCents, depositFeesCents, firstDepositCents,
 *     kycLevel }
 *
 * Gate set extends the CPA gates with two extras:
 *   - minDepositsCount  : lifetime count of deposit events
 *   - requirePositiveNgr: lifetime NGR must be > 0
 *
 * `now` is the timestamp used for the hold-period gate (injected for
 * testability). `alreadyPaidPlayerIds` is a Set or Array of player IDs
 * who have already triggered the fixed payout in prior reports.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function checkFixedQualification(rows, gates, alreadyPaidPlayerIds = [], now = new Date()) {
  const alreadyPaid = new Set(
    Array.isArray(alreadyPaidPlayerIds)
      ? alreadyPaidPlayerIds
      : Array.from(alreadyPaidPlayerIds || []),
  );
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();

  const newlyQualified = [];
  const pending = [];
  const rejected = [];

  for (const row of rows) {
    if (alreadyPaid.has(row.playerId)) {
      // Already paid in a prior period — never re-trigger.
      continue;
    }
    const decision = evaluate(row, gates, nowMs);
    if (decision.bucket === "qualified") {
      newlyQualified.push({ ...row, reason: decision.reason });
    } else if (decision.bucket === "pending") {
      pending.push({ ...row, reason: decision.reason });
    } else {
      rejected.push({ ...row, reason: decision.reason });
    }
  }

  return {
    newlyQualified: newlyQualified.length,
    pending: pending.length,
    rejected: rejected.length,
    newlyQualifiedRows: newlyQualified,
    pendingRows: pending,
    rejectedRows: rejected,
  };
}

function evaluate(row, gates, nowMs) {
  // FTD-deposit basis for the minDepositCents floor (same convention as CPA).
  const ftdDeposit =
    gates.depositBasis === "net"
      ? Math.max(0, (row.firstDepositCents || 0) - (row.depositFeesCents || 0))
      : row.firstDepositCents || 0;

  // 1. Minimum FTD deposit — permanent rejection (player only ever has one FTD).
  if (isActive(gates.minDepositCents) && ftdDeposit < gates.minDepositCents) {
    return { bucket: "rejected", reason: "ftd_deposit_below_min" };
  }

  // 2. Hold period — measured from FTD date.
  if (isActive(gates.holdDays)) {
    const ftdMs = row.ftdDate instanceof Date
      ? row.ftdDate.getTime()
      : new Date(row.ftdDate).getTime();
    const ageDays = (nowMs - ftdMs) / MS_PER_DAY;
    if (ageDays < gates.holdDays) {
      return { bucket: "pending", reason: "hold_period_not_met" };
    }
  }

  // 3. KYC tier — pending (player may level up later).
  if (gates.minKycLevel !== null && gates.minKycLevel !== undefined) {
    const playerKyc = Number(row.kycLevel) || 0;
    if (playerKyc < gates.minKycLevel) {
      return { bucket: "pending", reason: "kyc_below_min" };
    }
  }

  // 4. Lifetime deposit count.
  if (isActive(gates.minDepositsCount)) {
    if ((row.depositsCount || 0) < gates.minDepositsCount) {
      return { bucket: "pending", reason: "deposits_count_below_min" };
    }
  }

  // 5. Wager gates — flat floor + multiple-of-FTD. Lifetime wager metric.
  const wagerRequired = Math.max(
    isActive(gates.minWagerCents) ? gates.minWagerCents : 0,
    isActive(gates.minWagerMultiple) ? gates.minWagerMultiple * ftdDeposit : 0,
  );
  if (wagerRequired > 0 && (row.wagerCents || 0) < wagerRequired) {
    return { bucket: "pending", reason: "wager_below_min" };
  }

  // 6. Cash retention — lifetime deposits − cashouts must clear the floor.
  if (isActive(gates.minCashRetentionCents)) {
    const netCash = (row.depositsTotalCents || 0) - (row.cashoutsTotalCents || 0);
    if (netCash < gates.minCashRetentionCents) {
      return { bucket: "pending", reason: "cash_retention_below_min" };
    }
  }

  // 7. Positive NGR — operator hasn't lost money on this player.
  if (gates.requirePositiveNgr) {
    if (!((row.ngrCents || 0) > 0)) {
      return { bucket: "pending", reason: "ngr_not_positive" };
    }
  }

  return { bucket: "qualified", reason: "ok" };
}

function isActive(v) {
  return v !== null && v !== undefined && v > 0;
}

module.exports = { checkFixedQualification };
