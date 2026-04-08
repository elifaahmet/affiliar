import { z } from 'zod';

// Helper: non-negative integer
const nonNegativeInt = z.number().int().min(0);

// Metrics schema — all amounts in cents (integer), all counts non-negative integers
const metricsSchema = z.object({
  registrations: nonNegativeInt,

  ftdCount: nonNegativeInt,
  ftdSumCents: nonNegativeInt,

  depositsCount: nonNegativeInt,
  depositsSumCents: nonNegativeInt,

  cashoutsCount: nonNegativeInt,
  cashoutsSumCents: nonNegativeInt,

  chargebacksCount: nonNegativeInt,
  chargebacksSumCents: nonNegativeInt,

  betsSumCents: nonNegativeInt,
  winsSumCents: nonNegativeInt,

  casinoBetsRollbacksSumCents: nonNegativeInt,
  casinoWinsRollbacksSumCents: nonNegativeInt,

  bonusIssuesSumCents: nonNegativeInt,
  additionalDeductionsSumCents: nonNegativeInt,
  paymentSystemFeesSumCents: nonNegativeInt,
  jackpotFeesSumCents: nonNegativeInt,
  gameProviderFeesSumCents: nonNegativeInt,
  casinoTaxesSumCents: nonNegativeInt,

  roundsCount: nonNegativeInt,
  wagerCents: nonNegativeInt,

  // Derived fields — optional, validated separately in business rules
  casinoGgrCents: nonNegativeInt.optional(),
  casinoNgrCents: nonNegativeInt.optional(),
});

// Full event schema
export const affiliateCasinoAggregatedEventSchema = z.object({
  eventId: z.string().min(1),
  eventType: z.literal('affiliate.casino.activity.aggregated.v1'),
  eventVersion: z.literal(1),

  tenantId: z.string().min(1),
  operatorId: z.string().min(1).optional(),
  brandId: z.string().min(1),

  period: z.object({
    from: z.string().datetime({ offset: true }),
    to: z.string().datetime({ offset: true }),
    granularity: z.enum(['hour', 'day']),
  }),

  player: z.object({
    playerId: z.string().min(1),
    currency: z.string().min(1),
    country: z.string().optional(),
  }),

  affiliate: z
    .object({
      affiliateId: z.string().min(1).optional(),
      affiliateCode: z.string().min(1).optional(),
      campaign: z.string().optional(),
      subId: z.string().optional(),
    })
    .optional(),

  metrics: metricsSchema,

  playerStatuses: z
    .object({
      isDuplicate: z.boolean().optional(),
      isDisabled: z.boolean().optional(),
      isSelfExcluded: z.boolean().optional(),
      isVerified: z.boolean().optional(),
    })
    .optional(),

  source: z.object({
    system: z.string().min(1),
    traceId: z.string().optional(),
    producedAt: z.string().datetime({ offset: true }),
  }),
});

/**
 * Parse and validate a raw Kafka message payload.
 * Returns { success, data, error }.
 */
export function parseEvent(raw) {
  const result = affiliateCasinoAggregatedEventSchema.safeParse(raw);
  return result;
}
