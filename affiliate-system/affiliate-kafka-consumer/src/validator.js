/**
 * Business rule validators for AffiliateCasinoActivityAggregatedEvent.
 * Schema validation (Zod) runs first; these rules run after.
 */

/**
 * Validate period rules:
 * - from must be before to
 * - granularity=hour: both timestamps must be on the hour, exactly 1h apart
 * - granularity=day: from must be midnight, to must be exactly next midnight
 *
 * @param {{ from: string, to: string, granularity: string }} period
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validatePeriod(period) {
  const errors = [];
  const from = new Date(period.from);
  const to = new Date(period.to);

  if (from >= to) {
    errors.push(`period.from (${period.from}) must be before period.to (${period.to})`);
  }

  if (period.granularity === 'hour') {
    if (from.getUTCMinutes() !== 0 || from.getUTCSeconds() !== 0 || from.getUTCMilliseconds() !== 0) {
      errors.push(`period.from must be on the hour for granularity=hour, got ${period.from}`);
    }
    if (to.getUTCMinutes() !== 0 || to.getUTCSeconds() !== 0 || to.getUTCMilliseconds() !== 0) {
      errors.push(`period.to must be on the hour for granularity=hour, got ${period.to}`);
    }
    const diffMs = to - from;
    if (diffMs !== 60 * 60 * 1000) {
      errors.push(`period duration must be exactly 1 hour for granularity=hour, got ${diffMs / 1000}s`);
    }
  }

  if (period.granularity === 'day') {
    if (
      from.getUTCHours() !== 0 || from.getUTCMinutes() !== 0 ||
      from.getUTCSeconds() !== 0 || from.getUTCMilliseconds() !== 0
    ) {
      errors.push(`period.from must be midnight UTC for granularity=day, got ${period.from}`);
    }
    const diffMs = to - from;
    if (diffMs !== 24 * 60 * 60 * 1000) {
      errors.push(`period duration must be exactly 24 hours for granularity=day, got ${diffMs / 1000}s`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate metrics cross-field rules.
 *
 * @param {object} metrics
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateMetrics(metrics) {
  const errors = [];

  if (metrics.ftdCount > metrics.depositsCount) {
    errors.push(
      `ftdCount (${metrics.ftdCount}) cannot exceed depositsCount (${metrics.depositsCount})`
    );
  }

  if (metrics.ftdSumCents > metrics.depositsSumCents) {
    errors.push(
      `ftdSumCents (${metrics.ftdSumCents}) cannot exceed depositsSumCents (${metrics.depositsSumCents})`
    );
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Compute GGR and NGR from raw metrics.
 * GGR = (bets - betRollbacks) - (wins - winRollbacks)
 * NGR = GGR - deductions
 *
 * @param {object} metrics
 * @returns {{ computedGgrCents: number, computedNgrCents: number }}
 */
export function computeDerivedMetrics(metrics) {
  const computedGgrCents =
    metrics.betsSumCents -
    metrics.casinoBetsRollbacksSumCents -
    metrics.winsSumCents +
    metrics.casinoWinsRollbacksSumCents;

  const computedNgrCents =
    computedGgrCents -
    metrics.bonusIssuesSumCents -
    metrics.additionalDeductionsSumCents -
    metrics.paymentSystemFeesSumCents -
    metrics.jackpotFeesSumCents -
    metrics.gameProviderFeesSumCents -
    metrics.casinoTaxesSumCents;

  return { computedGgrCents, computedNgrCents };
}

/**
 * Compare producer-supplied derived metrics against server-computed values.
 * Emits a warning if there's a mismatch (does not reject the event).
 *
 * @param {object} metrics
 * @param {{ computedGgrCents: number, computedNgrCents: number }} computed
 * @param {string} eventId
 * @returns {{ ggrMismatch: boolean, ngrMismatch: boolean }}
 */
export function checkDerivedMetricMismatch(metrics, computed, eventId) {
  let ggrMismatch = false;
  let ngrMismatch = false;

  if (metrics.casinoGgrCents !== undefined && metrics.casinoGgrCents !== computed.computedGgrCents) {
    console.warn(
      `[validator] GGR mismatch on event ${eventId}: ` +
      `producer=${metrics.casinoGgrCents}, computed=${computed.computedGgrCents}`
    );
    ggrMismatch = true;
  }

  if (metrics.casinoNgrCents !== undefined && metrics.casinoNgrCents !== computed.computedNgrCents) {
    console.warn(
      `[validator] NGR mismatch on event ${eventId}: ` +
      `producer=${metrics.casinoNgrCents}, computed=${computed.computedNgrCents}`
    );
    ngrMismatch = true;
  }

  return { ggrMismatch, ngrMismatch };
}

/**
 * Run all business validations on a parsed event.
 * Throws an error if any hard rule fails.
 * Returns computed metrics and mismatch flags.
 *
 * @param {import('./types.d.ts').AffiliateCasinoActivityAggregatedEvent} event
 */
export function validateBusinessRules(event) {
  const periodResult = validatePeriod(event.period);
  if (!periodResult.valid) {
    throw new Error(`Period validation failed: ${periodResult.errors.join('; ')}`);
  }

  const metricsResult = validateMetrics(event.metrics);
  if (!metricsResult.valid) {
    throw new Error(`Metrics validation failed: ${metricsResult.errors.join('; ')}`);
  }

  const computed = computeDerivedMetrics(event.metrics);
  const { ggrMismatch, ngrMismatch } = checkDerivedMetricMismatch(
    event.metrics,
    computed,
    event.eventId
  );

  return { computed, ggrMismatch, ngrMismatch };
}
