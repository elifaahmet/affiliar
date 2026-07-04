/**
 * Commission engine — Phase 1 stub.
 *
 * In Phase 1, commission rules will be one of:
 *   - CPA by registration
 *   - CPA by FTD
 *   - RevShare by NGR
 *   - Hybrid (CPA + RevShare)
 *
 * This module receives a normalized input derived from activityHourly
 * and will write to the commissionLedger collection when implemented.
 */

/**
 * @typedef {object} CommissionInput
 * @property {string} tenantId
 * @property {string} brandId
 * @property {string} affiliateId
 * @property {string} playerId
 * @property {string} currency
 * @property {Date} from
 * @property {Date} to
 * @property {number} casinoNgrCents
 * @property {number} depositsCount
 * @property {number} depositsSumCents
 * @property {number} ftdCount
 * @property {number} ftdSumCents
 * @property {number} registrations
 * @property {{ isDuplicate: boolean, isDisabled: boolean, isSelfExcluded: boolean, isVerified: boolean }} statuses
 */

/**
 * Build the commission engine input from a processed event + derived metrics.
 *
 * @param {import('./types.d.ts').AffiliateCasinoActivityAggregatedEvent} event
 * @param {{ computedNgrCents: number }} derived
 * @returns {CommissionInput}
 */
export function buildCommissionInput(event, derived) {
  return {
    tenantId: event.tenantId,
    brandId: event.brandId,
    affiliateId: event.affiliate?.affiliateId ?? '',
    playerId: event.player.playerId,
    currency: event.player.currency,
    from: new Date(event.period.from),
    to: new Date(event.period.to),
    casinoNgrCents: derived.computedNgrCents,
    depositsCount: event.metrics.depositsCount,
    depositsSumCents: event.metrics.depositsSumCents,
    ftdCount: event.metrics.ftdCount,
    ftdSumCents: event.metrics.ftdSumCents,
    registrations: event.metrics.registrations,
    statuses: {
      isDuplicate: event.playerStatuses?.isDuplicate ?? false,
      isDisabled: event.playerStatuses?.isDisabled ?? false,
      isSelfExcluded: event.playerStatuses?.isSelfExcluded ?? false,
      isVerified: event.playerStatuses?.isVerified ?? false,
      isTest: event.playerStatuses?.isTest ?? false,
    },
  };
}

/**
 * Trigger commission calculation for a processed activity record.
 * Phase 1: stub — logs input and returns immediately.
 * Phase 2: will look up affiliate's commission model and write to commissionLedger.
 *
 * @param {CommissionInput} input
 */
export async function calculateCommission(input) {
  // Skip disqualified players (fraud statuses) + test accounts
  if (input.statuses.isDuplicate || input.statuses.isDisabled || input.statuses.isSelfExcluded || input.statuses.isTest) {
    console.log(
      `[commission] Skipping disqualified player ${input.playerId} ` +
      `(duplicate=${input.statuses.isDuplicate}, disabled=${input.statuses.isDisabled}, ` +
      `selfExcluded=${input.statuses.isSelfExcluded}, test=${input.statuses.isTest})`
    );
    return;
  }

  // TODO Phase 1: load affiliate commission model from DB and compute
  console.log(
    `[commission] STUB — would calculate for affiliate=${input.affiliateId} ` +
    `player=${input.playerId} ngr=${input.casinoNgrCents}c ftd=${input.ftdCount} ` +
    `deposits=${input.depositsCount} period=${input.from.toISOString()}`
  );
}
