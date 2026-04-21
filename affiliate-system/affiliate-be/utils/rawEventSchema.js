const { z } = require("zod");

// ── Common envelope ──────────────────────────────────────────────────────────

const envelopeSchema = z.object({
  eventId:    z.string().min(1),
  eventType:  z.string().min(1),
  tenantId:   z.string().min(1),
  brandId:    z.string().min(1),
  playerId:   z.string().min(1),
  currency:   z.string().min(1),
  occurredAt: z.string().datetime({ offset: true }),
  source: z.object({
    system:  z.string().min(1),
    traceId: z.string().optional(),
  }),
  data: z.record(z.unknown()).optional(),
});

// ── Per-event-type data schemas ──────────────────────────────────────────────

const playerRegisteredData = z.object({
  country:       z.string().optional(),
  affiliateCode: z.string().optional(),
  campaign:      z.string().optional(),
  subId:         z.string().optional(),
});

const playerFlaggedData = z.object({
  flag: z.enum(["disabled", "self_excluded", "unverified", "duplicate", "active"]),
});

const depositConfirmedData = z.object({
  amountCents:    z.number().int().min(0),
  paymentMethod:  z.string().optional(),
  isFirstDeposit: z.boolean(),
});

const depositChargebackData = z.object({
  amountCents:      z.number().int().min(0),
  originalEventId:  z.string().optional(),
});

const withdrawalCompletedData = z.object({
  amountCents: z.number().int().min(0),
});

const betPlacedData = z.object({
  betCents:   z.number().int().min(0),
  gameId:     z.string().optional(),
  providerId: z.string().optional(),
  roundId:    z.string().min(1),
  isBonus:    z.boolean().default(false),
});

const winSettledData = z.object({
  winCents: z.number().int().min(0),
  roundId:  z.string().min(1),
  isBonus:  z.boolean().default(false),
});

const betRollbackData = z.object({
  betCents:        z.number().int().min(0),
  roundId:         z.string().min(1),
  originalEventId: z.string().optional(),
  isBonus:         z.boolean().default(false),
});

const winRollbackData = z.object({
  winCents:        z.number().int().min(0),
  roundId:         z.string().min(1),
  originalEventId: z.string().optional(),
  isBonus:         z.boolean().default(false),
});

const bonusGrantedData = z.object({
  amountCents: z.number().int().min(0),
  bonusType:   z.string().optional(),
});

const feesDailyData = z.object({
  date:                       z.string(),
  paymentSystemFeesCents:     z.number().int().min(0).default(0),
  jackpotFeesCents:           z.number().int().min(0).default(0),
  gameProviderFeesCents:      z.number().int().min(0).default(0),
  casinoTaxesCents:           z.number().int().min(0).default(0),
  additionalDeductionsCents:  z.number().int().min(0).default(0),
});

// ── Type → data schema map ───────────────────────────────────────────────────

const EVENT_DATA_SCHEMAS = {
  "player.registered":            playerRegisteredData,
  "player.flagged":               playerFlaggedData,
  "wallet.deposit.confirmed":     depositConfirmedData,
  "wallet.deposit.chargeback":    depositChargebackData,
  "wallet.withdrawal.completed":  withdrawalCompletedData,
  "casino.bet.placed":            betPlacedData,
  "casino.win.settled":           winSettledData,
  "casino.bet.rollback":          betRollbackData,
  "casino.win.rollback":          winRollbackData,
  "bonus.granted":                bonusGrantedData,
  "fees.daily.adjustment":        feesDailyData,
};

const VALID_EVENT_TYPES = Object.keys(EVENT_DATA_SCHEMAS);

// ── Parse & validate ─────────────────────────────────────────────────────────

function parseRawEvent(raw) {
  // 1. Validate envelope
  const envResult = envelopeSchema.safeParse(raw);
  if (!envResult.success) {
    return { success: false, error: `Envelope: ${envResult.error.message}` };
  }

  const event = envResult.data;

  // 2. Check event type
  if (!VALID_EVENT_TYPES.includes(event.eventType)) {
    return { success: false, error: `Unknown eventType: ${event.eventType}` };
  }

  // 3. Validate data payload
  const dataSchema = EVENT_DATA_SCHEMAS[event.eventType];
  const dataResult = dataSchema.safeParse(event.data || {});
  if (!dataResult.success) {
    return { success: false, error: `data (${event.eventType}): ${dataResult.error.message}` };
  }

  return { success: true, event, data: dataResult.data };
}

module.exports = { parseRawEvent, VALID_EVENT_TYPES };
