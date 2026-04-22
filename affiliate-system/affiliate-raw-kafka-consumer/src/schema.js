import { z } from 'zod';

// ── Common envelope ──────────────────────────────────────────────────────────

const envelopeSchema = z.object({
  eventId:    z.string().min(1),
  eventType:  z.string().min(1),
  tenantId:   z.string().min(1),
  brandId:    z.string().min(1),
  playerId:   z.string().min(1),
  // Currency is the event's native currency (ISO code). Optional because
  // some events — notably player.registered — happen before a wallet
  // currency exists. The consumer treats empty/unknown as the base currency.
  currency:   z.string(),
  occurredAt: z.string().datetime({ offset: true }),
  source: z.object({
    system:  z.string().min(1),
    traceId: z.string().optional(),
  }),
  data: z.record(z.unknown()).optional(),
});

// ── Per-event-type data schemas ──────────────────────────────────────────────

const EVENT_DATA_SCHEMAS = {
  'player.registered': z.object({
    country:       z.string().optional(),
    affiliateCode: z.string().optional(),
    campaign:      z.string().optional(),
    subId:         z.string().optional(),
  }),
  'player.flagged': z.object({
    flag: z.enum(['disabled', 'self_excluded', 'unverified', 'duplicate', 'active']),
  }),
  'wallet.deposit.confirmed': z.object({
    amountCents:    z.number().int().min(0),
    paymentMethod:  z.string().optional(),
    isFirstDeposit: z.boolean(),
  }),
  'wallet.deposit.chargeback': z.object({
    amountCents:     z.number().int().min(0),
    originalEventId: z.string().optional(),
  }),
  'wallet.withdrawal.completed': z.object({
    amountCents: z.number().int().min(0),
  }),
  'casino.bet.placed': z.object({
    betCents:   z.number().int().min(0),
    gameId:     z.string().optional(),
    providerId: z.string().optional(),
    roundId:    z.string().min(1),
  }),
  'casino.win.settled': z.object({
    winCents: z.number().int().min(0),
    roundId:  z.string().min(1),
  }),
  'casino.bet.rollback': z.object({
    betCents:        z.number().int().min(0),
    roundId:         z.string().min(1),
    originalEventId: z.string().optional(),
  }),
  'casino.win.rollback': z.object({
    winCents:        z.number().int().min(0),
    roundId:         z.string().min(1),
    originalEventId: z.string().optional(),
  }),
  'bonus.granted': z.object({
    amountCents: z.number().int().min(0),
    bonusType:   z.string().optional(),
  }),
  'bonus.revoked': z.object({
    amountCents:     z.number().int().min(0),
    bonusType:       z.string().optional(),
    originalEventId: z.string().optional(),
    reason:          z.string().optional(),
  }),
  'fees.daily.adjustment': z.object({
    date:                       z.string(),
    paymentSystemFeesCents:     z.number().int().min(0).default(0),
    jackpotFeesCents:           z.number().int().min(0).default(0),
    gameProviderFeesCents:      z.number().int().min(0).default(0),
    casinoTaxesCents:           z.number().int().min(0).default(0),
    additionalDeductionsCents:  z.number().int().min(0).default(0),
  }),
};

const VALID_EVENT_TYPES = Object.keys(EVENT_DATA_SCHEMAS);

export function parseRawEvent(raw) {
  const envResult = envelopeSchema.safeParse(raw);
  if (!envResult.success) {
    return { success: false, error: `Envelope: ${envResult.error.message}` };
  }

  const event = envResult.data;

  if (!VALID_EVENT_TYPES.includes(event.eventType)) {
    return { success: false, error: `Unknown eventType: ${event.eventType}` };
  }

  const dataSchema = EVENT_DATA_SCHEMAS[event.eventType];
  const dataResult = dataSchema.safeParse(event.data || {});
  if (!dataResult.success) {
    return { success: false, error: `data (${event.eventType}): ${dataResult.error.message}` };
  }

  return { success: true, event, data: dataResult.data };
}
