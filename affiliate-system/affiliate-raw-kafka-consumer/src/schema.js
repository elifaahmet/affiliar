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
    // Exact click attribution: the click_id Affiliar's smartlink put on the
    // landing URL, echoed back by the casino. Optional (older traffic / direct
    // signups won't have it).
    clickId:       z.string().optional(),
    // Anti-fraud fingerprints (sha256 of IP / user-agent at signup). Optional.
    ipHash:        z.string().optional(),
    deviceHash:    z.string().optional(),
  }),
  'player.flagged': z.object({
    // "test" marks the player as a test/internal account (excluded from
    // NGR/FTD reporting + commission); "untest" promotes it back to a real
    // account (re-included retroactively); the rest are fraud/status signals.
    flag: z.enum(['disabled', 'self_excluded', 'unverified', 'duplicate', 'test', 'untest', 'active']),
  }),
  'wallet.deposit.confirmed': z.object({
    amountCents:    z.number().int().min(0),
    paymentMethod:  z.string().optional(),
    isFirstDeposit: z.boolean(),
    // Optional processor fee the operator paid to accept this deposit. If
    // present (even 0), Affiliar uses this value and skips the rate-based
    // fallback for this deposit. If absent, the daily fees cron applies the
    // operator's configured depositFeePercent to amountCents.
    feeCents:       z.number().int().min(0).optional(),
  }),
  'wallet.deposit.chargeback': z.object({
    amountCents:      z.number().int().min(0),
    originalEventId:  z.string().optional(),
    // Publisher computes this from prior deposit history; when true, the
    // consumer also reverses the FTD count/sum so CPA commissions don't
    // reward a fraudulent first deposit.
    wasFirstDeposit:  z.boolean().default(false),
  }),
  'wallet.correction.up': z.object({
    amountCents: z.number().int().min(0),
    reason:      z.string().optional(),
    // Optional product attribution. Absent defaults to 'casino' (legacy
    // behavior); set 'sportsbook' to route the adjustment into sb_ngr.
    product:     z.enum(['casino', 'sportsbook']).optional(),
  }),
  'wallet.correction.down': z.object({
    amountCents: z.number().int().min(0),
    reason:      z.string().optional(),
    product:     z.enum(['casino', 'sportsbook']).optional(),
  }),
  'wallet.withdrawal.completed': z.object({
    amountCents: z.number().int().min(0),
    // Same semantics as wallet.deposit.confirmed.feeCents, but applied against
    // withdrawalFeePercent. Send whenever your processor returns the exact
    // fee for this cashout.
    feeCents:    z.number().int().min(0).optional(),
  }),
  'casino.bet.placed': z.object({
    betCents:   z.number().int().min(0),
    // Optional — send the wager contribution if your platform weights bonus
    // wagering differently from the bet amount. Omitted → defaults to betCents.
    wagerCents: z.number().int().min(0).optional(),
    gameId:     z.string().optional(),
    providerId: z.string().optional(),
    roundId:    z.string().min(1),
  }),
  'casino.win.settled': z.object({
    winCents:   z.number().int().min(0),
    roundId:    z.string().min(1),
    providerId: z.string().optional(),
    gameId:     z.string().optional(),
  }),
  'casino.bet.rollback': z.object({
    betCents:        z.number().int().min(0),
    roundId:         z.string().min(1),
    originalEventId: z.string().optional(),
    providerId:      z.string().optional(),
  }),
  'casino.win.rollback': z.object({
    winCents:        z.number().int().min(0),
    roundId:         z.string().min(1),
    originalEventId: z.string().optional(),
    providerId:      z.string().optional(),
  }),
  'bonus.granted': z.object({
    amountCents: z.number().int().min(0),
    bonusType:   z.string().optional(),
    // Bonus attribution. Absent keeps the legacy semantics (lands in the
    // untagged bucket that feeds casino_ngr + combined_ngr — safe default
    // for platforms that haven't started tagging yet). Set 'casino' or
    // 'sportsbook' to route into product-specific buckets, or 'generic'
    // when a bonus genuinely spans both products (hits combined_ngr only).
    product:     z.enum(['casino', 'sportsbook', 'generic']).optional(),
  }),
  'bonus.revoked': z.object({
    amountCents:     z.number().int().min(0),
    bonusType:       z.string().optional(),
    originalEventId: z.string().optional(),
    reason:          z.string().optional(),
    product:         z.enum(['casino', 'sportsbook', 'generic']).optional(),
  }),
  'fees.daily.adjustment': z.object({
    date:                        z.string(),
    paymentSystemFeesCents:      z.number().int().min(0).default(0),
    jackpotFeesCents:            z.number().int().min(0).default(0),
    gameProviderFeesCents:       z.number().int().min(0).default(0),
    casinoTaxesCents:            z.number().int().min(0).default(0),
    additionalDeductionsCents:   z.number().int().min(0).default(0),
    // Sportsbook-side bulk adjustments. Each defaults to 0 so existing
    // payloads keep working.
    sbThirdPartyFeesCents:       z.number().int().min(0).default(0),
    sbBalanceCorrectionsCents:   z.number().int().default(0),
  }),

  // ── Sportsbook events ────────────────────────────────────────────────────
  //
  // Mirror the casino lifecycle. A bet is placed, then either rejected
  // (operator refused), cancelled (operator voided after accept), or
  // settled (outcome resolved). win_rollback reverses a paid win.

  'sportsbook.bet.placed': z.object({
    betCents: z.number().int().min(0),
    betId:    z.string().min(1),
    eventId:  z.string().optional(), // sporting event id (match / fixture)
    market:   z.string().optional(),
  }),
  'sportsbook.bet.rejected': z.object({
    // Stake that was placed but the operator rejected. Netted out of
    // sb_ggr so the bet effectively didn't happen.
    betCents:        z.number().int().min(0),
    betId:           z.string().min(1),
    originalEventId: z.string().optional(),
    reason:          z.string().optional(),
  }),
  'sportsbook.bet.cancelled': z.object({
    // Stake accepted and later voided (e.g. match abandoned). Same
    // treatment as rejected in the NGR formula.
    betCents:        z.number().int().min(0),
    betId:           z.string().min(1),
    originalEventId: z.string().optional(),
    reason:          z.string().optional(),
  }),
  'sportsbook.bet.settled': z.object({
    // Outcome resolved. For won bets `winCents` is the payout. For lost /
    // pushed bets `winCents` should be 0. Half-wins/half-losses land in
    // between — operator computes.
    betCents:  z.number().int().min(0),
    winCents:  z.number().int().min(0).default(0),
    betId:     z.string().min(1),
    outcome:   z.enum(['won', 'lost', 'pushed', 'half_won', 'half_lost']).optional(),
  }),
  'sportsbook.win.rollback': z.object({
    // Reverses a prior settled win (e.g. result correction). Deducted from
    // sb_wins so it doesn't stay inflated in the NGR formula.
    winCents:        z.number().int().min(0),
    betId:           z.string().min(1),
    originalEventId: z.string().optional(),
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
