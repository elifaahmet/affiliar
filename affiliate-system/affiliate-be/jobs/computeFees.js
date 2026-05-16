"use strict";

/**
 * Pure fee calculation. No I/O — takes an aggregated bucket and the resolved
 * rates, returns the fee deltas that should be written back into ClickHouse.
 *
 * Partial-mix semantics: if the bucket's deposits/cashouts include events
 * that carried their own feeCents (tracked via *_fee_attributed_sum_cents),
 * those amounts are subtracted from the rate base so the cron only computes
 * the fee for un-attributed transactions.
 *
 * All inputs/outputs are integer cents.
 */
function computeFeesForBucket(bucket, rates) {
  const bets     = Number(bucket.bets)     || 0;
  const wins     = Number(bucket.wins)     || 0;
  const deposits = Number(bucket.deposits) || 0;
  const cashouts = Number(bucket.cashouts) || 0;
  const depositsFeeAttributed = Number(bucket.depositsFeeAttributed) || 0;
  const cashoutsFeeAttributed = Number(bucket.cashoutsFeeAttributed) || 0;
  const providerGgr = Math.max(0, bets - wins);

  const depositPct    = Number(rates.depositFeePercent) || 0;
  const withdrawalPct = Number(rates.withdrawalFeePercent) || 0;
  const jackpotPct    = Number(rates.jackpotFeePercent) || 0;
  const taxPct        = Number(rates.casinoTaxPercent) || 0;
  const providerPct   = Number(rates.providerFeePercent) || 0;

  const depositRateBase = Math.max(0, deposits - depositsFeeAttributed);
  const cashoutRateBase = Math.max(0, cashouts - cashoutsFeeAttributed);

  return {
    gameProviderFees: Math.round((providerGgr * providerPct) / 100),
    depositFees:      Math.round((depositRateBase * depositPct) / 100),
    withdrawalFees:   Math.round((cashoutRateBase * withdrawalPct) / 100),
    jackpotFees:      Math.round((bets * jackpotPct) / 100),
    casinoTaxes:      Math.round((providerGgr * taxPct) / 100),
  };
}

/**
 * Sum of operator-defined custom-fee percentages, applied to a combined-GGR
 * base. Each row is computed independently and integer-rounded so the rolled-up
 * total matches what the affiliate UI shows per row.
 */
function computeCustomFeesForBucket(combinedGgr, customFees) {
  const base = Math.max(0, Number(combinedGgr) || 0);
  if (!Array.isArray(customFees) || customFees.length === 0 || base === 0) {
    return 0;
  }
  let total = 0;
  for (const row of customFees) {
    const pct = Number(row?.feePercent) || 0;
    if (pct <= 0) continue;
    total += Math.round((base * pct) / 100);
  }
  return total;
}

module.exports = { computeFeesForBucket, computeCustomFeesForBucket };
