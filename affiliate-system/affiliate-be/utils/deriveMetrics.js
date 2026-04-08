/**
 * Compute GGR and NGR from raw metrics.
 *
 * GGR = (bets - betRollbacks) - (wins - winRollbacks)
 * NGR = GGR - bonusIssues - additionalDeductions - paymentFees - jackpotFees - providerFees - taxes
 *
 * @param {object} m - metrics object (all values in cents)
 * @returns {{ computedGgrCents: number, computedNgrCents: number }}
 */
function computeDerivedMetrics(m) {
  const computedGgrCents =
    m.betsSumCents -
    m.casinoBetsRollbacksSumCents -
    m.winsSumCents +
    m.casinoWinsRollbacksSumCents;

  const computedNgrCents =
    computedGgrCents -
    m.bonusIssuesSumCents -
    m.additionalDeductionsSumCents -
    m.paymentSystemFeesSumCents -
    m.jackpotFeesSumCents -
    m.gameProviderFeesSumCents -
    m.casinoTaxesSumCents;

  return { computedGgrCents, computedNgrCents };
}

/**
 * Check whether producer-supplied GGR/NGR values match server-computed values.
 *
 * @param {object} m - metrics object
 * @param {{ computedGgrCents: number, computedNgrCents: number }} computed
 * @returns {{ ggrMismatch: boolean, ngrMismatch: boolean }}
 */
function checkMismatch(m, computed) {
  const ggrMismatch =
    m.casinoGgrCents !== undefined && m.casinoGgrCents !== computed.computedGgrCents;
  const ngrMismatch =
    m.casinoNgrCents !== undefined && m.casinoNgrCents !== computed.computedNgrCents;
  return { ggrMismatch, ngrMismatch };
}

module.exports = { computeDerivedMetrics, checkMismatch };
