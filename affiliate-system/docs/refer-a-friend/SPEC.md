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
    secretHash: String,               // bcrypt hash of signing secret (secret revealed once at creation)
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
  referrerPlayerId: String,           // operator-scoped player id, NOT an Affiliar user
  refereePlayerId: String,            // the friend
  refCode: String,                    // short code shared with referee, indexed
  status: 'pending_signup'             // refCode generated, no signup yet
        | 'pending_ftd'                // friend signed up, awaiting first deposit
        | 'pending_qualification'      // FTD made, gates not cleared yet
        | 'qualified'                  // gates cleared, reward owed
        | 'rewarded'                   // reward emitted to operator and acknowledged
        | 'rejected',                  // failed gates / fraud / capped
  rejectionReason: String | null,
  signedUpAt: Date | null,
  ftdAt: Date | null,
  ftdCents: Number | null,
  ftdCurrency: String | null,
  qualifiedAt: Date | null,
  rewardCents: Number | null,         // computed at qualification time
  rewardCurrency: String | null,
  configSnapshot: Object,             // copy of ReferAFriendConfig at qualification time, for audit
  createdAt, updatedAt
}
```

Key invariants:
- `(brandId, refereePlayerId)` is unique — a player can only be referred once
- `(brandId, refCode)` is unique — codes don't collide
- A player cannot refer themselves (same `refereePlayerId === referrerPlayerId` rejected at track-signup)

### 3.3 `RewardDelivery` — outbound webhook queue

```js
{
  referralId: ObjectId,               // ref to PlayerReferral
  brandId, operatorId,
  payload: Object,                    // immutable; what we POST to operator's webhook
  payloadHash: String,                // sha256 of payload for idempotency on operator side
  status: 'pending' | 'delivered' | 'failed',
  attempts: Number,                   // 0..6
  nextAttemptAt: Date,
  lastAttemptAt: Date | null,
  lastResponse: {
    statusCode: Number,
    bodySnippet: String,              // first 256 chars
    latencyMs: Number,
    errorMessage: String | null,
  } | null,
  deliveredAt: Date | null,
  createdAt
}
```

See [WEBHOOK.md](./WEBHOOK.md) for the contract details.

## 4. Lifecycle

```
                  ┌────────────────┐
                  │ pending_signup │  refCode generated
                  └───────┬────────┘
                          │ track-signup event
                          ▼
                  ┌────────────────┐
                  │ pending_ftd    │
                  └───────┬────────┘
                          │ track-ftd event
                          ▼
              ┌────────────────────────┐
              │ pending_qualification  │  ← qualification job re-runs daily
              └───────┬─────────────┬──┘
       gates clear    │             │  fraud / cap / hold expired without wager
                      ▼             ▼
               ┌──────────┐   ┌──────────┐
               │ qualified│   │ rejected │  (terminal)
               └────┬─────┘   └──────────┘
                    │ emit reward → enqueue RewardDelivery
                    ▼
               ┌──────────┐
               │ rewarded │  (terminal, after 2xx ack from webhook)
               └──────────┘
```

## 5. Engine: `referralEngine`

A single orchestrator with three entry points:

| Function | Caller | Job |
|---|---|---|
| `trackSignup({ brandId, refereePlayerId, refCode })` | integration controller | Create `PlayerReferral` in `pending_ftd` if `refCode` is valid and referee is not already referred. |
| `trackFtd({ brandId, refereePlayerId, depositCents, currency })` | integration controller | Mark FTD on the matching referral, transition to `pending_qualification`. |
| `evaluateQualification(referralId)` | nightly cron + on-demand after FTD | Apply gates from `ReferAFriendConfig`. If clear → `qualified` + emit reward. If hold not expired → leave pending. If permanently failed → `rejected`. |

The engine never modifies player wallets directly. Reward emission is a write to `RewardDelivery` with status `pending`; the delivery worker handles the HTTP call.

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

Backend:
- [ ] `models/ReferAFriendConfig.js`
- [ ] `models/PlayerReferral.js`
- [ ] `models/RewardDelivery.js`
- [ ] `engine/referralEngine.js`
- [ ] `engine/referralQualification.js` (slim, modeled on `cpaQualification.js`)
- [ ] `jobs/referralQualificationJob.js` (nightly)
- [ ] `jobs/referralDeliveryWorker.js` (continuous queue worker)
- [ ] `controllers/affiliate/referAFriendController.js` (operator config + reports + replay)
- [ ] `controllers/integration/referAFriendIntegrationController.js` (track-signup, track-ftd)
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

## 10. Non-trivial open questions

| Question | Default |
|---|---|
| Where does `refCode` get generated — affiliar or operator? | Affiliar. `POST /api/refer/code/issue` returns `{ code, link }`. Operator caches it on their player record. |
| What happens if a referee is also a registered affiliate? | Refer-a-Friend track-signup is rejected with reason `referee_is_affiliate`. Affiliate program takes precedence. |
| Can a player accumulate referrals across multiple brands? | Yes — `PlayerReferral` is brand-scoped. A player can be a referrer at brand A and a referee at brand B without conflict. The "duplicate referee" check is operator-scoped, not brand-scoped. |
| What if `ReferAFriendConfig` is disabled mid-qualification? | Existing in-flight referrals continue. New track-signup requests on a disabled brand are rejected. |
| FX for `percent_of_first_deposit`? | Use the same FX path as commission engine (ECB daily rate); store both native and normalized. |

## 11. Phase 2 sketch (for context, do not implement)

- Kafka outbound transport as an alternative to webhook
- Multi-hop chains (A → B → C with diminishing rewards)
- Player API: `GET /api/v1/refer/code`, `GET /api/v1/refer/stats` for the referrer
- Referrer leaderboards
- Co-op campaigns (two friends sign up together → both rewarded)
