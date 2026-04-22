# Affiliar — Raw Events Integration Guide

This document describes how a casino platform can stream **raw events** to Affiliar, instead of pre-aggregating them into the periodic `activity.aggregated.v1` payload described in [integration-guide.md](./integration-guide.md).

| Method | Use when |
|--------|----------|
| **Aggregated events** ([integration-guide.md](./integration-guide.md)) | The casino platform can produce hourly/daily player rollups itself. Lower event volume, simpler consumer. |
| **Raw events** (this doc) | The casino platform already emits granular events (deposit, bet, win, ...) and aggregating them server-side is easier than rolling them up locally. |

Both methods write into the same canonical `activity_hourly` ClickHouse table — they are mutually compatible. Pick whichever fits the casino's existing event pipeline best.

---

## 1. Architecture

```
Casino platform
   │  publishes raw events to Kafka
   ▼
[ affiliate.raw.events.v1 ]   ← shared topic
   │
   ▼
Raw consumer (stateless)
   │  inserts each event into ClickHouse
   ▼
ClickHouse: raw_events table (TTL 7 days)
   │
   │  AggregatingMergeTree materialized view
   ▼
ClickHouse: activity_hourly  ← single source of truth
```

- **Raw consumer is stateless** — every event is one ClickHouse `INSERT`. No in-memory window, no state to lose on restart.
- **`raw_events`** is a short-term landing table only (TTL 7 days). Affiliar does not retain raw history long-term — operators are expected to keep their own raw event log.
- **Materialized view** rolls events up into `activity_hourly` automatically. Reports, dashboards, commission calculation all read from `activity_hourly` without caring how the data got there.
- **Recompute window**: within the 7-day TTL, the materialized view can be dropped and rebuilt to recompute aggregates from scratch.

---

## 2. Kafka Topic

| | |
|---|---|
| **Topic** | `affiliate.raw.events.v1` |
| **Format** | JSON, one event per message |
| **Partition key** | `playerId` (so all events for the same player land on the same partition in order) |
| **Schema** | See section 4 below |

---

## 3. Common Envelope

Every event — regardless of type — must contain these fields:

```json
{
  "eventId": "550e8400-e29b-41d4-a716-446655440000",
  "eventType": "wallet.deposit.confirmed",
  "tenantId": "69d68b885946ea65a9d805db",
  "brandId":  "69d692da55284f229ad805db",
  "playerId": "player_TR_001",
  "currency": "EUR",
  "occurredAt": "2026-04-09T13:42:00Z",
  "source": {
    "system":  "hexora-casino",
    "traceId": "optional-correlation-id"
  },
  "data": { /* event-type specific payload */ }
}
```

| Field | Required | Notes |
|---|---|---|
| `eventId` | yes | Unique per event. Used for idempotency / dedup. UUID v4 recommended. |
| `eventType` | yes | One of the types in section 4. |
| `tenantId` | yes | The Affiliar `Operator._id` for this casino. Provided to you during onboarding. |
| `brandId` | yes | The Affiliar `Brand._id` the player belongs to. |
| `playerId` | yes | Stable opaque identifier from the casino — never an email. |
| `currency` | yes | ISO 4217 code (e.g. `EUR`, `USD`, `TRY`). |
| `occurredAt` | yes | ISO 8601 with timezone. Use the actual business event time, not the publish time. |
| `source.system` | yes | Identifier for the producing system. |
| `source.traceId` | no | Optional correlation ID for debugging. |
| `data` | depends | Event-type specific. See below. |

> **Important**: All monetary fields are integers in **cents** (smallest unit of the currency). `12.34 EUR` → `1234`. Never floats.

---

## 4. Event Types

### 4.1 `player.registered`

Emitted **once** when a new player completes registration. This is the only event that links a player to an affiliate.

```json
{
  "eventType": "player.registered",
  "data": {
    "country":       "TR",
    "affiliateCode": "ABC123XY",
    "campaign":      "spring_promo_2026",
    "subId":         "banner_top"
  }
}
```

| Field | Required | Notes |
|---|---|---|
| `country` | no | ISO 3166-1 alpha-2. |
| `affiliateCode` | **conditionally required** | The referral code captured from `?affiliate=` on the landing page (cookie / localStorage). **If missing, the player will not be attributed to any affiliate** and no commission will be earned for them. |
| `campaign` | no | Campaign tag from the referral link. |
| `subId` | no | Sub-source / placement tag from the referral link. |

> **Critical**: The casino's signup flow must read `?affiliate=` from the URL on landing, persist it (cookie or localStorage), and pass it back to the registration endpoint. The player frontend ships with [`affiliateTracking.ts`](../../new-pixup/player-system/player-frontend/src/utils/affiliate/affiliateTracking.ts) which handles this automatically — replicate the same logic if your casino doesn't already capture it.

---

### 4.2 `player.flagged`

Emitted when a player is disabled, self-excluded, or fails KYC. Used to mark commissions as ineligible.

```json
{
  "eventType": "player.flagged",
  "data": {
    "flag": "self_excluded"
  }
}
```

| Field | Required | Notes |
|---|---|---|
| `flag` | yes | One of: `disabled`, `self_excluded`, `unverified`, `duplicate`, `active`. |

> Send this event whenever the player's status changes — including when a flag is **lifted** (`flag: "active"` to clear). Affiliar persists the latest status on the `affiliateplayers` doc so the operator's Players tab shows a live status badge.

---

### 4.3 `wallet.deposit.confirmed`

Emitted when a deposit is **confirmed** (money has actually arrived). **Do not** emit this for pending deposits.

```json
{
  "eventType": "wallet.deposit.confirmed",
  "data": {
    "amountCents":      10000,
    "paymentMethod":    "credit_card",
    "isFirstDeposit":   true,
    "providerDepositId": "stripe_pi_xxx"
  }
}
```

| Field | Required | Notes |
|---|---|---|
| `amountCents` | yes | Net deposit amount, integer cents. |
| `paymentMethod` | no | Free-form, for analytics. |
| `isFirstDeposit` | yes | `true` if this is the player's first ever confirmed deposit. **The casino must determine this** — Affiliar trusts the flag. |
| `providerDepositId` | no | External reference for reconciliation. |

---

### 4.4 `wallet.deposit.chargeback`

Emitted when a previously confirmed deposit is reversed (chargeback, refund, fraud claim).

```json
{
  "eventType": "wallet.deposit.chargeback",
  "data": {
    "amountCents":      10000,
    "originalEventId":  "550e8400-e29b-41d4-a716-446655440000",
    "wasFirstDeposit":  true
  }
}
```

| Field | Required | Notes |
|---|---|---|
| `amountCents` | yes | Amount being reversed, integer cents. |
| `originalEventId` | no | `eventId` of the original `wallet.deposit.confirmed` event, for audit. |
| `wasFirstDeposit` | no (default `false`) | **Set `true` when the deposit being reversed was the player's FTD.** Affiliar will then reverse the `ftd_count` and `ftd_sum_cents` deltas so CPA commissions aren't paid on a fraudulent first deposit. |

---

### 4.5 `wallet.withdrawal.completed`

Emitted when a withdrawal has been **paid out** to the player. Do not emit for pending or cancelled withdrawals.

```json
{
  "eventType": "wallet.withdrawal.completed",
  "data": {
    "amountCents": 5000
  }
}
```

---

### 4.6 `casino.bet.placed`

Emitted at the start of a casino round.

```json
{
  "eventType": "casino.bet.placed",
  "data": {
    "betCents":   100,
    "gameId":     "pragmatic:sweet_bonanza",
    "providerId": "pragmatic",
    "roundId":    "round_abc_123"
  }
}
```

| Field | Required | Notes |
|---|---|---|
| `betCents` | yes | Stake for this bet, integer cents. |
| `gameId` | no | Stable game identifier. |
| `providerId` | no | Game provider key. |
| `roundId` | yes | Stable round identifier. Used to correlate with `casino.win.settled` and rollbacks. |

---

### 4.7 `casino.win.settled`

Emitted when a casino round closes and a payout is determined. Send even if the win is `0` — Affiliar uses `bet count vs win count` for player activity metrics.

```json
{
  "eventType": "casino.win.settled",
  "data": {
    "winCents":   250,
    "roundId":    "round_abc_123",
    "providerId": "pragmatic",
    "gameId":     "pragmatic:sweet_bonanza"
  }
}
```

> **Always include `providerId`** on every casino event (bet / win / rollback). Affiliar's per-provider GGR relies on it — mismatched providers between a bet and its paired win split the row and break provider-level reports.

---

### 4.8 `casino.bet.rollback`

A previously placed bet is reverted (technical rollback, dispute, etc.).

```json
{
  "eventType": "casino.bet.rollback",
  "data": {
    "betCents":        100,
    "roundId":         "round_abc_123",
    "originalEventId": "...",
    "providerId":      "pragmatic"
  }
}
```

---

### 4.9 `casino.win.rollback`

A previously settled win is clawed back.

```json
{
  "eventType": "casino.win.rollback",
  "data": {
    "winCents":        250,
    "roundId":         "round_abc_123",
    "originalEventId": "...",
    "providerId":      "pragmatic"
  }
}
```

---

### 4.10 `bonus.granted`

Emitted when the casino issues a bonus (cash, freespins value, cashback, etc.) that affects the player's NGR.

```json
{
  "eventType": "bonus.granted",
  "data": {
    "amountCents": 1000,
    "bonusType":   "welcome"
  }
}
```

| Field | Required | Notes |
|---|---|---|
| `amountCents` | yes | Cash equivalent of the bonus. |
| `bonusType` | no | Free-form: `welcome`, `reload`, `freespin`, `cashback`, etc. |

---

### 4.11 `bonus.revoked`

Emitted when a previously-granted bonus wallet expires or is cancelled before the player consumes it. Affiliar writes a **negative** delta to `bonus_issues_sum_cents` so a granted-but-unused bonus nets to zero on NGR.

```json
{
  "eventType": "bonus.revoked",
  "data": {
    "amountCents":     1000,
    "bonusType":       "welcome",
    "originalEventId": "550e8400-e29b-41d4-a716-446655440000",
    "reason":          "expired"
  }
}
```

| Field | Required | Notes |
|---|---|---|
| `amountCents` | yes | Portion being revoked (usually the unused balance, not the full grant). |
| `bonusType` | no | Match the granting event for traceability. |
| `originalEventId` | no | `eventId` of the original `bonus.granted`. |
| `reason` | no | Free-form: `expired`, `cancelled`, `duplicate`, etc. |

> Only emit for bonuses that truly went unused. If a bonus was consumed and its balance legitimately dropped to zero, **don't** send `bonus.revoked` — the corresponding wagers already moved through `casino.bet.placed` / `casino.win.settled`.

---

### 4.12 `wallet.correction.up` / `wallet.correction.down`

Manual admin adjustments to a player's wallet that aren't real deposits or withdrawals. Named from the **casino P&L perspective** (independent of how the wallet changed): `up` = casino gained, `down` = casino lost.

- **`wallet.correction.up`** — admin debited the player (casino recovered money). **Increases** NGR.
- **`wallet.correction.down`** — admin credited the player (casino gifted money). **Decreases** NGR.

```json
{
  "eventType": "wallet.correction.up",
  "data": {
    "amountCents": 5000,
    "reason":      "fraud recovery"
  }
}
```

```json
{
  "eventType": "wallet.correction.down",
  "data": {
    "amountCents": 2000,
    "reason":      "admin goodwill"
  }
}
```

| Field | Required | Notes |
|---|---|---|
| `amountCents` | yes | Cash value of the adjustment, integer cents. |
| `reason` | no | Free-form — shows up on the Affiliar audit log. |

> **Not the same as `wallet.deposit.chargeback`**: chargeback represents a bank-initiated reversal of a real deposit and carries the `wasFirstDeposit` flag for CPA reversal. Corrections are purely internal admin adjustments and don't affect FTD counts.

---

### 4.13 `fees.daily.adjustment`

Emitted **once per day per player** with that day's fee allocations. These are usually computed by the casino's reconciliation job, not in real time.

```json
{
  "eventType": "fees.daily.adjustment",
  "data": {
    "date":                       "2026-04-09",
    "paymentSystemFeesCents":     50,
    "jackpotFeesCents":           20,
    "gameProviderFeesCents":      100,
    "casinoTaxesCents":           150,
    "additionalDeductionsCents":  0
  }
}
```

> If your casino doesn't break fees down per player, send a single brand-level event with `playerId: "_brand_aggregate_"` — Affiliar will distribute it proportionally to NGR (TBD, configurable).

#### Alternative: let Affiliar compute fees

If you don't want to run reconciliation yourself, configure percentages
per operator (and optionally per brand) via the **Operator → Fees**
screen. Affiliar's daily cron will derive fees from the same ClickHouse
data that drives NGR:

- Payment-system % of deposits
- Jackpot % of bets
- Casino tax % of GGR
- Per-provider revenue-share % of provider GGR

> **Don't mix sources within the same category.** For each of the four
> fee buckets, either leave the percentage at 0 and publish your own
> `fees.daily.adjustment`, or configure the percentage and don't
> publish that category's value. Mixing double-counts the deduction.
> Mixing *across* categories (e.g. UI-computed payment fees + external
> event for provider fees) is fine.

---

## 5. What NOT to send

To keep the pipeline clean, **do not send** the following:

| | Reason |
|---|---|
| Pending / unconfirmed deposits or withdrawals | Status changes too often, creates noise. Wait until terminal state. |
| Per-spin bonus issuances | Send `bonus.granted` once with the cash value, not one event per spin. |
| Authentication / login events | Not relevant for affiliate accounting. |
| Game session start/end events | Use `bet.placed` / `win.settled` instead. |
| Wallet balance snapshots | Affiliar derives balances from event stream. |

---

## 6. Ordering and Idempotency

- **Partition by `playerId`** to guarantee per-player ordering. Cross-player ordering does not matter.
- **`eventId` is the dedup key.** The raw consumer drops messages whose `eventId` is already present in the last 7 days. Re-publishing an event is safe.
- **`occurredAt` drives the bucket assignment** in `activity_hourly` (truncated to the hour). Never use the publish time.
- **Late events are accepted** as long as `occurredAt` is within the last 7 days. After that, the materialized view rebuild window is closed and the event is dropped.

---

## 7. Failure handling

| Scenario | Behavior |
|---|---|
| Schema validation fails | Event logged to a dead-letter topic (`affiliate.raw.events.dlq.v1`) for manual review. |
| `tenantId` / `brandId` unknown | Same — DLQ. |
| `playerId` unknown for `player.registered` | Always accepted (this is when the player is created). |
| Other event for unknown `playerId` | Accepted; player is implicit. Affiliate attribution still works as long as the future `player.registered` arrives within the TTL window. |
| Duplicate `eventId` | Silently dropped. |

---

## 8. Onboarding checklist

For a new casino integrating via raw events:

- [ ] Receive `tenantId` (Operator `_id`) and `brandId`(s) from Affiliar
- [ ] Receive Kafka credentials and topic name
- [ ] Implement `?affiliate=` capture on landing pages and pass through to registration
- [ ] Wire `player.registered` to publish on signup completion
- [ ] Wire `wallet.deposit.confirmed` (with FTD flag)
- [ ] Wire `wallet.withdrawal.completed`
- [ ] Wire `casino.bet.placed` and `casino.win.settled`
- [ ] Wire optional events: `bonus.granted`, rollbacks, chargebacks, daily fees
- [ ] Test on staging with synthetic player flow (register → deposit → bet/win → withdraw)
- [ ] Verify aggregated rows appear in Affiliar's `activity_hourly` within 1 hour

---

## 9. Example: full player lifecycle

A new TR player registers via affiliate `ABC123XY`, deposits €100, plays a few rounds, withdraws €50.

```jsonc
// 1. Registration
{
  "eventId": "evt-1",
  "eventType": "player.registered",
  "tenantId": "...", "brandId": "...", "playerId": "p1",
  "currency": "EUR", "occurredAt": "2026-04-09T10:00:00Z",
  "source": { "system": "hexora-casino" },
  "data": { "country": "TR", "affiliateCode": "ABC123XY", "campaign": "spring_promo" }
}

// 2. First deposit
{
  "eventId": "evt-2",
  "eventType": "wallet.deposit.confirmed",
  "tenantId": "...", "brandId": "...", "playerId": "p1",
  "currency": "EUR", "occurredAt": "2026-04-09T10:05:00Z",
  "source": { "system": "hexora-casino" },
  "data": { "amountCents": 10000, "isFirstDeposit": true }
}

// 3a. Bet
{
  "eventId": "evt-3",
  "eventType": "casino.bet.placed",
  "tenantId": "...", "brandId": "...", "playerId": "p1",
  "currency": "EUR", "occurredAt": "2026-04-09T10:10:00Z",
  "source": { "system": "hexora-casino" },
  "data": { "betCents": 200, "roundId": "r1", "gameId": "pragmatic:sweet_bonanza" }
}

// 3b. Win
{
  "eventId": "evt-4",
  "eventType": "casino.win.settled",
  "tenantId": "...", "brandId": "...", "playerId": "p1",
  "currency": "EUR", "occurredAt": "2026-04-09T10:10:30Z",
  "source": { "system": "hexora-casino" },
  "data": { "winCents": 350, "roundId": "r1" }
}

// 4. Withdrawal
{
  "eventId": "evt-5",
  "eventType": "wallet.withdrawal.completed",
  "tenantId": "...", "brandId": "...", "playerId": "p1",
  "currency": "EUR", "occurredAt": "2026-04-09T11:00:00Z",
  "source": { "system": "hexora-casino" },
  "data": { "amountCents": 5000 }
}
```

After the materialized view aggregates these events, Affiliar's `activity_hourly` row for `(tenant, brand, p1, EUR, 2026-04-09 10:00:00)` will contain:

| Metric | Value |
|---|---|
| `registrations` | 1 |
| `ftd_count` | 1 |
| `ftd_sum_cents` | 10000 |
| `deposits_count` | 1 |
| `deposits_sum_cents` | 10000 |
| `bets_sum_cents` | 200 |
| `wins_sum_cents` | 350 |
| `casino_ggr_cents` | -150 |
| `cashouts_count` | 1 (in 11:00 bucket) |
| `cashouts_sum_cents` | 5000 (in 11:00 bucket) |
