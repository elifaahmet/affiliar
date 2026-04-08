# Affiliar — Operator Integration Guide

This document describes how an operator's casino platform integrates with Affiliar to report player activity for affiliate tracking, commission calculation, and reporting.

There are two integration methods:

| Method | When to use |
|--------|-------------|
| **REST API** | Simpler setup; operator pushes data via HTTP |
| **Kafka** | High-volume / real-time; operator publishes events to a shared Kafka topic |

Both methods write into the same canonical `activityHourly` store. Choose one.

---

## 1. Authentication

All REST API calls require a JWT bearer token obtained via the login flow.

```
POST /api/auth/login
Content-Type: application/json

{
  "identifier": "your-operator-username",
  "password": "your-password"
}
```

Use the returned token in all subsequent requests:

```
Authorization: Bearer <token>
```

The operator account must have `role: "operator"` and be linked to an Operator record.

---

## 2. REST API — Activity Import

### Endpoint

```
POST /api/integration/activity
Authorization: Bearer <token>
Content-Type: application/json
```

### Request body

```json
{
  "from": "2026-04-03T10:00:00.000Z",
  "to":   "2026-04-03T11:00:00.000Z",
  "granularity": "hour",
  "brandId": "brand_001",
  "players": [ ...player objects... ]
}
```

#### Top-level fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `from` | ISO 8601 UTC string | Yes | Period start |
| `to` | ISO 8601 UTC string | Yes | Period end |
| `granularity` | `"hour"` \| `"day"` | No (default: `"hour"`) | Aggregation window |
| `brandId` | string | No (default: `"default"`) | Brand identifier |
| `players` | array | Yes | One object per player per currency |

#### Period rules

- `from` must be before `to`
- **granularity=hour**: both timestamps must be on the hour (minutes/seconds = 0), duration must be exactly 1 hour
- **granularity=day**: `from` must be midnight UTC, duration must be exactly 24 hours

#### Player object

```json
{
  "playerId": "player_001",
  "currency": "EUR",
  "country": "DE",
  "affiliateId": "aff_001",
  "affiliateCode": "SUMMER2026",
  "campaign": "summer_campaign",
  "subId": "tg_channel_1",
  "playerStatuses": {
    "isDuplicate": false,
    "isDisabled": false,
    "isSelfExcluded": false,
    "isVerified": true
  },
  "metrics": { ...see metrics below... }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `playerId` | string | Yes | Operator's internal player ID |
| `currency` | string | Yes | ISO 4217 currency code (e.g. `"EUR"`) |
| `country` | string | No | ISO 3166-1 alpha-2 country code |
| `affiliateId` | string | No | Affiliate's identifier |
| `affiliateCode` | string | No | Tracking code used at registration |
| `campaign` | string | No | Campaign name |
| `subId` | string | No | Sub-channel / sub-affiliate ID |
| `playerStatuses` | object | No | Boolean flags (see below) |
| `metrics` | object | Yes | All numeric activity fields (see below) |

#### playerStatuses

| Field | Type | Description |
|-------|------|-------------|
| `isDuplicate` | boolean | Player registered from a duplicate account |
| `isDisabled` | boolean | Account is currently disabled |
| `isSelfExcluded` | boolean | Player has self-excluded |
| `isVerified` | boolean | KYC verified |

#### metrics — all values are **integers in cents** (1 EUR = 100)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `betsSumCents` | integer ≥ 0 | Yes | Total bet amount |
| `winsSumCents` | integer ≥ 0 | Yes | Total win amount |
| `casinoBetsRollbacksSumCents` | integer ≥ 0 | Yes | Rolled-back bets |
| `casinoWinsRollbacksSumCents` | integer ≥ 0 | Yes | Rolled-back wins |
| `depositsCount` | integer ≥ 0 | Yes | Number of deposits |
| `depositsSumCents` | integer ≥ 0 | Yes | Total deposit amount |
| `cashoutsCount` | integer ≥ 0 | Yes | Number of cashouts |
| `cashoutsSumCents` | integer ≥ 0 | Yes | Total cashout amount |
| `bonusIssuesSumCents` | integer ≥ 0 | Yes | Total bonus value issued |
| `additionalDeductionsSumCents` | integer ≥ 0 | Yes | Any other operator deductions |
| `paymentSystemFeesSumCents` | integer ≥ 0 | Yes | Payment processing fees |
| `jackpotFeesSumCents` | integer ≥ 0 | Yes | Jackpot contribution fees |
| `gameProviderFeesSumCents` | integer ≥ 0 | Yes | Game provider revenue share fees |
| `casinoTaxesSumCents` | integer ≥ 0 | Yes | Gambling taxes |
| `roundsCount` | integer ≥ 0 | Yes | Number of game rounds played |
| `wagerCents` | integer ≥ 0 | Yes | Total wagered amount (usually = bets) |
| `registrations` | integer ≥ 0 | Yes | New registrations in this period (0 or 1) |
| `ftdCount` | integer ≥ 0 | Yes | First time deposit count (0 or 1) |
| `ftdSumCents` | integer ≥ 0 | Yes | First time deposit amount |
| `chargebacksCount` | integer ≥ 0 | Yes | Number of chargebacks |
| `chargebacksSumCents` | integer ≥ 0 | Yes | Total chargeback amount |
| `casinoGgrCents` | integer | No | Producer-computed GGR (used for mismatch check only) |
| `casinoNgrCents` | integer | No | Producer-computed NGR (used for mismatch check only) |

> **Note on GGR / NGR:** Affiliar always recomputes these server-side using the formulas below. If you provide `casinoGgrCents` / `casinoNgrCents`, they are compared against the server values and a warning is logged on mismatch — the record is **not** rejected.
>
> ```
> GGR = (bets - betRollbacks) - (wins - winRollbacks)
> NGR = GGR - bonusIssues - additionalDeductions - paymentFees - jackpotFees - providerFees - taxes
> ```

#### Validation rules

- All required metric fields must be present, numeric, and ≥ 0
- `ftdCount` ≤ `depositsCount`
- `ftdSumCents` ≤ `depositsSumCents`
- Each `(playerId, currency)` pair within the same period is deduplicated — duplicates are skipped, not rejected

### Response

```json
{
  "success": true,
  "period": {
    "from": "2026-04-03T10:00:00.000Z",
    "to":   "2026-04-03T11:00:00.000Z",
    "granularity": "hour"
  },
  "results": {
    "inserted": 18,
    "skipped": 2,
    "failed": [
      {
        "playerId": "player_bad",
        "currency": "EUR",
        "reason": "Invalid or missing metric fields: roundsCount"
      }
    ]
  }
}
```

| Field | Description |
|-------|-------------|
| `inserted` | Records successfully written |
| `skipped` | Duplicate business keys (already reported for this period) |
| `failed` | Validation errors — these records were not written |

---

## 3. Kafka Integration

For operators who prefer event-driven integration, publish to the Kafka topic directly.

### Topic

```
affiliate.casino.activity.aggregated.v1
```

### Partition key

```
{tenantId}:{brandId}:{playerId}:{currency}
```

Using this key ensures all events for the same player are processed in order.

### Event envelope

```json
{
  "eventId": "A1B2C3D4E5F6...",
  "eventType": "affiliate.casino.activity.aggregated.v1",
  "eventVersion": 1,

  "tenantId": "your-tenant-id",
  "operatorId": "op_001",
  "brandId": "brand_001",

  "period": {
    "from": "2026-04-03T10:00:00.000Z",
    "to":   "2026-04-03T11:00:00.000Z",
    "granularity": "hour"
  },

  "player": {
    "playerId": "player_001",
    "currency": "EUR",
    "country": "DE"
  },

  "affiliate": {
    "affiliateId": "aff_001",
    "affiliateCode": "SUMMER2026",
    "campaign": "summer_campaign",
    "subId": "tg_channel_1"
  },

  "metrics": {
    "registrations": 0,
    "ftdCount": 0,
    "ftdSumCents": 0,
    "depositsCount": 2,
    "depositsSumCents": 20000,
    "cashoutsCount": 1,
    "cashoutsSumCents": 5000,
    "chargebacksCount": 0,
    "chargebacksSumCents": 0,
    "betsSumCents": 150000,
    "winsSumCents": 120000,
    "casinoBetsRollbacksSumCents": 0,
    "casinoWinsRollbacksSumCents": 0,
    "bonusIssuesSumCents": 1000,
    "additionalDeductionsSumCents": 0,
    "paymentSystemFeesSumCents": 0,
    "jackpotFeesSumCents": 0,
    "gameProviderFeesSumCents": 2000,
    "casinoTaxesSumCents": 500,
    "roundsCount": 45,
    "wagerCents": 150000,
    "casinoGgrCents": 30000,
    "casinoNgrCents": 26500
  },

  "playerStatuses": {
    "isDuplicate": false,
    "isDisabled": false,
    "isSelfExcluded": false,
    "isVerified": true
  },

  "source": {
    "system": "casino-backend",
    "traceId": "trace_A1B2C3D4",
    "producedAt": "2026-04-03T11:00:05.000Z"
  }
}
```

#### Field notes

| Field | Notes |
|-------|-------|
| `eventId` | Must be globally unique (UUID recommended). Used for exactly-once deduplication at the inbox level. |
| `eventVersion` | Always `1` for this contract version |
| `tenantId` | Your assigned tenant ID — provided by Affiliar during onboarding |
| `period.granularity` | `"hour"` or `"day"` — same period rules as REST API apply |
| `metrics` | Same fields and rules as REST API. All amounts in cents (integers). |
| `source.producedAt` | ISO 8601 UTC timestamp of when the event was produced |

### Idempotency

The consumer enforces two levels of deduplication:

1. **Envelope level** — `eventId` is unique in the inbox. Duplicate `eventId` → silently skipped.
2. **Business key level** — `(tenantId, brandId, from, to, playerId, currency)` is unique in `activityHourly`. Duplicate business key → silently skipped.

It is safe to re-publish events in case of failure.

---

## 4. One record per player per period

Both integrations expect **one record per player per currency per period**. Do not split a single player's activity across multiple records for the same period.

If you aggregate hourly, submit one record per player at the end of each hour.
If you aggregate daily, submit one record per player at the end of each day.

---

## 5. Example: full hourly batch (REST)

```bash
curl -X POST https://your-affiliar-instance/api/integration/activity \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "2026-04-03T10:00:00.000Z",
    "to":   "2026-04-03T11:00:00.000Z",
    "granularity": "hour",
    "brandId": "brand_001",
    "players": [
      {
        "playerId": "player_001",
        "currency": "EUR",
        "country": "DE",
        "affiliateId": "aff_001",
        "affiliateCode": "SUMMER2026",
        "campaign": "summer_campaign",
        "subId": "tg_channel_1",
        "playerStatuses": {
          "isDuplicate": false,
          "isDisabled": false,
          "isSelfExcluded": false,
          "isVerified": true
        },
        "metrics": {
          "betsSumCents": 150000,
          "winsSumCents": 120000,
          "casinoBetsRollbacksSumCents": 0,
          "casinoWinsRollbacksSumCents": 0,
          "depositsCount": 2,
          "depositsSumCents": 20000,
          "cashoutsCount": 1,
          "cashoutsSumCents": 5000,
          "bonusIssuesSumCents": 1000,
          "additionalDeductionsSumCents": 0,
          "paymentSystemFeesSumCents": 0,
          "jackpotFeesSumCents": 0,
          "gameProviderFeesSumCents": 2000,
          "casinoTaxesSumCents": 500,
          "roundsCount": 45,
          "wagerCents": 150000,
          "registrations": 0,
          "ftdCount": 0,
          "ftdSumCents": 0,
          "chargebacksCount": 0,
          "chargebacksSumCents": 0
        }
      }
    ]
  }'
```

---

## 6. Affiliate Registration Flow

This section describes how affiliates join an operator's network through Affiliar.

### Overview

```
Operator dashboard  →  copies invite link
       ↓
Affiliate clicks link  →  /register?operatorId=<id>
       ↓
Fills registration form  →  POST /api/auth/affiliate-register
       ↓
Account created: User (role=affiliate) + AffiliateProfile + affiliateCode
       ↓
Affiliate uses their code in tracking links: ?ref=<affiliateCode>
```

### Step 1 — Operator generates an invite link

The operator copies the invite link from **Affiliates → Invite Affiliate** tab in the dashboard. The link contains the operator's ID:

```
https://your-affiliar-instance/register?operatorId=69cfab3805fe8a17fd4d736c
```

### Step 2 — Affiliate registers

The affiliate opens the link and fills out the registration form. The page is publicly accessible — no existing account required.

**Endpoint**
```
POST /api/auth/affiliate-register
Content-Type: application/json
```

**Request body**
```json
{
  "operatorId": "69cfab3805fe8a17fd4d736c",
  "name": "Jane Doe",
  "email": "jane@example.com",
  "username": "janedoe",
  "password": "securepassword",
  "mobileCountryCode": "49",
  "mobileNumber": "1711234567"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `operatorId` | string | Yes | Taken from the invite link — identifies which operator this affiliate belongs to |
| `name` | string | Yes | Full name |
| `email` | string | Yes | Must be unique across the system |
| `username` | string | Yes | Must be unique across the system |
| `password` | string | Yes | Min. 8 characters |
| `mobileCountryCode` | string | No | Country calling code without `+` (e.g. `"49"`) |
| `mobileNumber` | string | No | Local phone number |

**Response (201)**
```json
{
  "message": "Affiliate registered successfully",
  "affiliateCode": "ABCD5678",
  "user": {
    "id": "...",
    "email": "jane@example.com",
    "username": "janedoe"
  }
}
```

**Error responses**

| Status | Reason |
|--------|--------|
| `400` | Missing required fields |
| `400` | `operatorId` does not match any operator |
| `409` | Email or username already taken |

### Step 3 — Affiliate receives their code

After registration, the affiliate receives an 8-character alphanumeric code (e.g. `ABCD5678`). This code is:

- Stored in `AffiliateProfile.referralCodes`
- Used as `affiliateCode` in activity events sent to Affiliar
- Used in tracking links on the affiliate's side (e.g. `?ref=ABCD5678`)

### Step 4 — Operator maps activity to affiliate

When the operator sends activity data (via REST or Kafka), they include the affiliate's code in each player record:

```json
{
  "affiliateId": "...",
  "affiliateCode": "ABCD5678",
  "campaign": "summer_2026"
}
```

Affiliar uses `affiliateCode` to attribute player activity to the correct affiliate account. The operator's backend must store the `affiliateCode` at the point of player registration (when the player arrives via a tracking link).

### Step 5 — Operator sees affiliate in dashboard

Registered affiliates appear immediately in the operator's **Affiliates** tab with their name, email, phone, status, and join date. Their performance metrics appear in **Reports → Affiliates** once activity data is submitted.

---

## 7. Error reference

| HTTP Status | Meaning |
|-------------|---------|
| `400` | Validation failed — see `error` / `details` in response |
| `401` | Missing or invalid token |
| `403` | Account does not have operator role |
| `200` | Request accepted — check `results.failed` for per-record errors |

Per-record failures do not affect other records in the same batch. A response with `"success": true` and non-empty `failed` array means some records were rejected but others were written.

---

## 7. Onboarding checklist

**Operator setup**
- [ ] Receive your `tenantId` from Affiliar
- [ ] Create an operator account (or receive credentials)
- [ ] Choose integration method: REST or Kafka
- [ ] If Kafka: confirm broker address and topic name with Affiliar team
- [ ] Send a test batch for a past hour and verify data appears in the Reports dashboard
- [ ] Set up a recurring job to push data hourly (or daily)

**Affiliate onboarding**
- [ ] Copy invite link from Affiliates → Invite Affiliate tab
- [ ] Share link with affiliates
- [ ] Affiliate registers via the link and receives their `affiliateCode`
- [ ] Ensure your platform stores `affiliateCode` when a player registers via a tracking link
- [ ] Include `affiliateCode` in all activity submissions for players referred by that affiliate
