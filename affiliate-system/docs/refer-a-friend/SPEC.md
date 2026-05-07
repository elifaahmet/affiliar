# Refer-a-Friend — Phase 1 Spec

**Status:** draft · Phase 1 (MVP)
**Owner:** Affiliar core
**Last updated:** 2026-05-07

This is a player-grade referral feature, distinct from the existing affiliate program. A real player invites another player; once the friend deposits and clears qualification, the referrer earns a small reward that the operator's wallet/bonus system credits.

It runs alongside — but never on top of — the affiliate engine. Existing affiliate routes, models, and engines are not modified by Phase 1.

## 1. Why a separate feature

| | Affiliate program | Refer-a-Friend |
|---|---|---|
| Subject | Partners (often companies) | Players (B2C end users) |
| Onboarding | Invite, KYC, contract | Inline in casino UX |
| Reward cadence | Monthly RevShare / CPA reports, manual approve | One-shot per qualified friend, near-realtime |
| Reward target | Affiliate payout account | Player's wallet / bonus balance |
| Qualification | Per commission plan, complex tiers | Single set of gates per brand |
| Reporting | Heavy commission reports + audit | Lightweight activity log |

Trying to model this on top of `Affiliate` / `CommissionPlan` would either bloat the affiliate UI or force half-broken edge cases into the commission engine. Phase 1 keeps it isolated.

## 2. Out of scope (Phase 1)

- Multi-tier referrer chains (A refers B refers C). Single hop only.
- Player-facing UI (operator's casino owns the share button, leaderboard, etc.). Affiliar provides the engine + APIs.
- Direct wallet credit. Affiliar emits a webhook; operator credits.
- Localization of reward types. `bonus`, `cash`, `freespins` strings only — operator interprets.
- A/B testing of reward amounts. One config per brand.

## 3. Concepts & data model

Three new collections, no changes to existing ones.

### 3.1 `ReferAFriendConfig` — per-brand config

```js
{
  brandId: ObjectId,                  // unique per brand
  operatorId: ObjectId,               // denormalized for fast operator-scoped queries
  enabled: Boolean,                   // master toggle, default false
  reward: {
    type: 'fixed_bonus' | 'percent_of_first_deposit',
    amountCents: Number,              // when type='fixed_bonus'
    percent: Number,                  // when type='percent_of_first_deposit'
    capCents: Number,                 // hard cap on percent reward, optional
    currency: String,                 // 'EUR' default; affiliar normalizes incoming FTDs
    rewardKind: 'bonus' | 'cash' | 'freespins'  // hint to operator
  },
  qualification: {
    minDepositCents: Number,          // friend's FTD must clear this
    holdDays: Number,                 // wait N days after FTD before paying out
    minWagerCents: Number,            // friend must wager at least this in casino
    minWagerMultiple: Number,         // OR Nx the FTD amount, whichever is higher
  },
  caps: {
    perReferrerMonthlyCents: Number,  // max one referrer can earn in a month
    perBrandMonthlyCents: Number,     // brand-wide spending cap per month
  },
  webhook: {
    url: String,                      // operator endpoint to receive reward events
    signingSecret: String,            // HMAC-SHA256 key; revealed once in dashboard at generation time, kept literal in DB so the worker can sign requests (KMS-encrypted-at-rest is a future upgrade)
    secretRotatedAt: Date,            // audit: when the secret was last regenerated
    enabled: Boolean,
  },
  createdAt, updatedAt
}
```

Reuse pattern: the `qualification` block deliberately mirrors the shape of `CommissionPlan.cpa.qualification` so operators familiar with CPA gates land on the same mental model. Phase 2 may extract a shared schema.

### 3.2 `PlayerReferral` — one row per friend brought in

```js
{
  brandId: ObjectId,
  operatorId: ObjectId,
  referrerPlayerId: String,           // operator-scoped player id, the inviter
  refereePlayerId: String,            // the friend, also operator-scoped
  refCode: String | null,             // optional metadata; operator generates it
  status: 'pending_ftd'                // signed up, awaiting first deposit
        | 'pending_qualification'      // FTD made, gates not cleared yet
        | 'qualified'                  // gates cleared, reward computed
        | 'rewarded'                   // reward emitted and acknowledged by operator
        | 'reversed'                   // FTD reversed after reward — operator notified to claw back
        | 'rejected',                  // failed gates / fraud / capped (terminal)
  rejectionReason: String | null,
  signedUpAt: Date | null,
  ftdAt: Date | null,
  ftdCents: Number | null,
  ftdCurrency: String | null,
  qualifiedAt: Date | null,
  rewardCents: Number | null,         // computed at qualification time
  rewardCurrency: String | null,
  reversedAt: Date | null,
  reversedAmountCents: Number | null, // amount reversed (operator-supplied)
  reversalReason: String | null,      // 'chargeback' | 'fraud' | other free-form
  configSnapshot: Object,             // copy of ReferAFriendConfig at qualification time, for audit
  createdAt, updatedAt
}
```

Key invariants:
- `(operatorId, refereePlayerId)` is unique — a player can be referred at most once across all of an operator's brands
- A player cannot refer themselves — `refereePlayerId === referrerPlayerId` is rejected at track-signup
- `refCode` is operator-owned; affiliar does not generate or guarantee uniqueness

### 3.3 `RewardDelivery` — outbound webhook queue

```js
{
  referralId: ObjectId,               // ref to PlayerReferral
  brandId, operatorId,
  eventType: 'referral.reward.issued' | 'referral.reward.reversed',
  payload: Object,                    // immutable; what we POST to operator's webhook
  payloadHash: String,                // sha256 of payload body
  status: 'pending' | 'delivered' | 'failed',
  attempts: Number,                   // 0..6
  nextAttemptAt: Date,                // worker only picks up rows whose nextAttemptAt has elapsed
  lastAttemptAt: Date | null,
  deliveredAt: Date | null,
  lastResponse: {                     // overwritten each attempt
    statusCode: Number | null,
    bodySnippet: String | null,       // first 256 chars
    latencyMs: Number | null,
    errorMessage: String | null,      // network/timeout failures
    attemptedAt: Date | null,
  },
  attemptHistory: [                   // full audit trail, capped at 6 entries
    { attemptedAt, statusCode, bodySnippet, latencyMs, errorMessage }
  ],
  replayOf: ObjectId | null,          // when an operator replays a failed delivery, the new row points at the original; null on first delivery
  createdAt, updatedAt
}
```

See [WEBHOOK.md](./WEBHOOK.md) for the contract details. The same `referralId` can produce one `issued` delivery and (much later) one `reversed` delivery — they are separate rows.

## 4. Lifecycle

```
                  ┌────────────────┐
                  │ pending_ftd    │  ← created by track-signup
                  └───────┬────────┘
                          │ track-ftd
                          ▼
              ┌────────────────────────┐
              │ pending_qualification  │  ← qualification job re-runs daily
              └───────┬─────────────┬──┘
       gates clear    │             │  fraud / cap / hold expired without wager
                      ▼             ▼
               ┌──────────┐   ┌──────────┐
               │ qualified│   │ rejected │  (terminal)
               └────┬─────┘   └──────────┘
                    │ emit reward.issued → enqueue RewardDelivery
                    ▼
               ┌──────────┐
               │ rewarded │
               └────┬─────┘
                    │ track-ftd-reversal (any time after 'rewarded')
                    ▼
               ┌──────────┐
               │ reversed │  emit reward.reversed → enqueue RewardDelivery
               └──────────┘  (terminal)
```

Reversal also short-circuits earlier states:

| State at reversal time | Result |
|---|---|
| `pending_qualification` | → `rejected` with reason `ftd_reversed`. No webhook fired (nothing was paid). |
| `qualified` | → `rejected`. Cancel the in-flight `referral.reward.issued` delivery if not yet sent; if already sent and `2xx` received, treat as `rewarded` and fire `referral.reward.reversed`. |
| `rewarded` | → `reversed`. Fire `referral.reward.reversed`. |
| `reversed` / `rejected` | No-op. Idempotent. |

## 5. Engine: `referralEngine`

A single orchestrator with four entry points:

| Function | Caller | Job |
|---|---|---|
| `trackSignup({ brandId, referrerPlayerId, refereePlayerId, refCode? })` | integration controller | Create `PlayerReferral` in `pending_ftd` if referee not already referred for this operator and not self-referring. |
| `trackFtd({ brandId, refereePlayerId, depositCents, currency, depositedAt? })` | integration controller | Mark FTD on the matching referral, transition to `pending_qualification`. |
| `trackFtdReversal({ brandId, refereePlayerId, reversedCents, reason })` | integration controller | Apply reversal logic per §4 table. May enqueue `referral.reward.reversed` delivery. |
| `evaluateQualification(referralId)` | nightly cron + on-demand after FTD | Apply gates from `ReferAFriendConfig`. If clear → `qualified` + enqueue `referral.reward.issued` delivery. If hold not expired → leave pending. If permanently failed → `rejected`. |

The engine never modifies player wallets directly. Reward emission is always a write to `RewardDelivery` with status `pending`; the delivery worker handles the HTTP call.

### 5.1 Borrowing patterns from `commissionEngine` / `cpaQualification`

The qualification math (hold period, min deposit, wager threshold) closely resembles the existing CPA gate logic. We **do not import** from `engine/cpaQualification.js` — that file lives inside the affiliate program and we want the refer-a-friend module to remain entirely standalone, so existing affiliate code can be modified without breaking us.

Instead, `engine/referralQualification.js` reimplements the same algorithm against `ReferAFriendConfig.qualification` (which has a slimmer shape). If we ever extract a shared "QualificationGates" library, both modules can adopt it; until then, the duplication is intentional.

## 6. Anti-abuse (Phase 1 baseline)

These are enforced inside the engine, not behind a feature flag:

- **Self-referral** — `refereePlayerId === referrerPlayerId` → reject at signup
- **Duplicate referee** — same player can't be referred twice across brands of one operator (we check unique on `(operatorId, refereePlayerId)` not just brand)
- **Cap enforcement** — at `qualified` step, check monthly caps; if exceeded, transition to `rejected` with `rejectionReason: 'cap_exceeded'`
- **Hold period + wager gate** — must clear `qualification.holdDays` AND `qualification.minWagerCents` (or Nx FTD)

Phase 2 hooks: device fingerprint match, IP geolocation distance, KYC document match.

## 7. Reporting

One new operator-facing tab: **Refer-a-Friend Activity**, scoped per brand.

Columns:
- Referrer player id
- Referee player id
- Status badge
- FTD date / amount
- Qualified date
- Reward cents
- Delivery status (with badge: pending / delivered / failed)
- Action: replay (if failed)

A row click expands to show the full `RewardDelivery` history (each attempt, status code, latency).

This is intentionally a separate page from the existing Reports / Commission Reports — no risk of mixing affiliate P&L with refer-a-friend liability.

## 8. Settings UI

New tab in **Settings**: "Refer-a-Friend".

Per-brand cards. Each card:
- Master toggle (`enabled`)
- Reward configuration form
- Qualification gates form
- Caps form
- Webhook section:
  - URL input
  - "Generate secret" button (reveals secret once, stores hash)
  - "Send test event" button — fires a synthetic `referral.reward.issued` to the configured URL
  - Recent deliveries list (last 20)

## 9. Phase 1 build list

Backend (all under net-new paths; no edits to existing files):
- [ ] `models/ReferAFriendConfig.js`
- [ ] `models/PlayerReferral.js`
- [ ] `models/RewardDelivery.js`
- [ ] `engine/referralEngine.js`
- [ ] `engine/referralQualification.js` (parallel to `cpaQualification.js`, no import)
- [ ] `jobs/referralQualificationJob.js` (nightly)
- [ ] `jobs/referralDeliveryWorker.js` (continuous queue worker, HMAC signing, retry policy)
- [ ] `controllers/affiliate/referAFriendController.js` (operator config + reports + replay)
- [ ] `controllers/integration/referAFriendIntegrationController.js` (track-signup, track-ftd, track-ftd-reversal)
- [ ] `routes/affiliate/referAFriendRoutes.js`
- [ ] `routes/integration/referAFriendIntegrationRoutes.js`

Frontend:
- [ ] `src/pages/refer-a-friend/index.tsx` (Settings tab)
- [ ] `src/pages/refer-a-friend/components/BrandConfigCard.tsx`
- [ ] `src/pages/refer-a-friend/components/WebhookConfig.tsx`
- [ ] `src/pages/refer-a-friend/components/DeliveriesPanel.tsx`
- [ ] `src/pages/refer-a-friend/activity/index.tsx` (Activity report)
- [ ] Sidebar nav entry (gated on enablement?)

Docs:
- [x] `docs/refer-a-friend/SPEC.md` (this file)
- [x] `docs/refer-a-friend/WEBHOOK.md`
- [x] `docs/refer-a-friend/INTEGRATION.md`

## 10. Resolved decisions

| Question | Decision |
|---|---|
| Where does `refCode` get generated — affiliar or operator? | **Operator owns it.** Affiliar receives `referrerPlayerId` directly on track-signup; `refCode` is optional metadata for reporting. We do not generate or validate code uniqueness. |
| What happens if a referee is also a registered affiliate? | Track-signup is rejected with reason `referee_is_affiliate`. Affiliate program takes precedence. |
| Can a player be referred across multiple brands? | **No.** The duplicate-referee check is operator-scoped — a player can only be a referee on one brand of one operator, ever. Cross-brand referee spam is blocked. |
| What if `ReferAFriendConfig` is disabled mid-qualification? | Existing in-flight referrals continue. New track-signup requests on a disabled brand are rejected. |
| FX for `percent_of_first_deposit`? | Use the same FX path as commission engine (ECB daily rate); store both native and normalized amounts. |
| Chargeback / FTD reversal handling? | **Phase 1.** Operator calls `track-ftd-reversal`. Engine transitions per §4 table; emits `referral.reward.reversed` if a reward was already paid. Operator's wallet system performs the actual claw-back. |

## 11. Phase 2 sketch (for context, do not implement)

- Kafka outbound transport as an alternative to webhook (same payload schema)
- Multi-hop chains (A → B → C with diminishing rewards)
- Affiliar-managed code generation (currently operator-owned)
- Player-facing API: `GET /api/v1/refer/stats` for the referrer (currently operator handles all UX)
- Referrer leaderboards
- Co-op campaigns (two friends sign up together → both rewarded)
- Device fingerprint / KYC match for fraud detection
- Stale-referral expiry job (auto-reject referrals stuck in `pending_qualification` for > N days)
