# Refer-a-Friend — Operator Integration Guide

This document is for the operator's product/engineering team enabling a player-to-player referral feature inside their casino. Affiliar provides the engine, the qualification rules, and the reward emission. Your casino owns the player-facing UI (share button, code copy, leaderboards, etc.).

Phase 1 ships with these integration surfaces:

| Surface | Direction | Use |
|---|---|---|
| **REST: track-signup** | operator → affiliar | Tell affiliar a friend signed up using a referrer's code |
| **REST: track-ftd** | operator → affiliar | Tell affiliar a friend made their first deposit |
| **REST: track-ftd-reversal** | operator → affiliar | Tell affiliar a previously tracked FTD was reversed (chargeback, fraud, etc.) |
| **Webhook: reward.issued** | affiliar → operator | Credit the referrer (see [WEBHOOK.md](./WEBHOOK.md)) |
| **Webhook: reward.reversed** | affiliar → operator | Claw back a previously credited reward |

There is intentionally no Kafka path in Phase 1. If you need higher throughput later, raise an issue — Phase 2 reuses the same payload schema over Kafka.

**Code ownership:** the referral code lives entirely on your side. You generate it (e.g. on first request from Player A's casino UI), store it on your player record, and resolve it back to a `referrerPlayerId` when Player B signs up. Affiliar never sees a code without an accompanying `referrerPlayerId`, and never validates code uniqueness — that's your job.

## 1. Player flow, end-to-end

```
Player A in casino UI
  ↓ taps "Refer a friend"
casino backend generates a code locally (e.g. "PA-A3F7")
casino backend stores { code, playerId } on its own player record
casino UI displays code/link, copy + share buttons (your design)

…friend clicks link, lands on signup page with ?ref=PA-A3F7…

Player B fills signup form
casino backend resolves "PA-A3F7" → "p_A" via its own lookup
casino backend → affiliar  POST /api/v1/refer/track-signup
  with { brandId, referrerPlayerId: "p_A", refereePlayerId: "p_B", refCode: "PA-A3F7" }
  ← 201 Created  (or 409 if B already a referee anywhere on this operator)

…Player B makes their first deposit…

casino backend → affiliar  POST /api/v1/refer/track-ftd
  with { brandId, refereePlayerId: "p_B", depositCents, currency }
  ← 200 OK

…Player B plays, accumulates wagering, hold period passes…
…Affiliar nightly qualification job clears the gates…

affiliar → operator  POST {your webhook URL}
  with payload { type: "referral.reward.issued", referrerPlayerId: "p_A", rewardCents: 500, ... }
  ← your endpoint credits Player A's wallet, returns 200

Player A sees credited reward in their wallet.

…(later) Player B's FTD is charged back…

casino backend → affiliar  POST /api/v1/refer/track-ftd-reversal
  with { brandId, refereePlayerId: "p_B", reversedCents, reason: "chargeback" }
  ← 200 OK

affiliar → operator  POST {your webhook URL}
  with payload { type: "referral.reward.reversed", referrerPlayerId: "p_A", rewardCents: 500, ... }
  ← your endpoint debits Player A's wallet (your policy decides exact mechanics).
```

## 2. Authentication

All REST endpoints require the same JWT bearer token used elsewhere in Affiliar:

```
Authorization: Bearer <token>
```

The operator account must have `role: "operator"`. See [integration-guide.md §1](../integration-guide.md) for token acquisition.

## 3. REST: track-signup

Call this once your registration flow has completed for a player who arrived via a referral code. You resolve the code to a `referrerPlayerId` on your side and pass both to us.

```
POST /api/v1/refer/track-signup
Content-Type: application/json
Authorization: Bearer <token>

{
  "brandId": "65b4c7a1...",
  "referrerPlayerId": "p_A",
  "refereePlayerId": "p_B",
  "refCode": "PA-A3F7"      // optional metadata, stored as-is for reporting
}
```

Response:

```json
{
  "referralId": "65f7a912...",
  "status": "pending_ftd"
}
```

Reject conditions:

| Status | Reason |
|---|---|
| 400 | Missing required field |
| 409 | `refereePlayerId` is already a referee (any brand on this operator) |
| 409 | Self-referral: `referrerPlayerId === refereePlayerId` |
| 403 | Refer-a-Friend disabled for this brand |
| 403 | Referee is also an active affiliate (affiliate program takes precedence) |

This endpoint is **idempotent** on `(operatorId, refereePlayerId)`. Re-calling with the same payload returns the existing referral. If you re-call with a *different* `referrerPlayerId` for the same referee, you get `409`.

## 4. REST: track-ftd

Call this when a referee makes their first qualifying deposit.

```
POST /api/v1/refer/track-ftd
Content-Type: application/json
Authorization: Bearer <token>

{
  "brandId": "65b4c7a1...",
  "refereePlayerId": "p_B",
  "depositCents": 5000,
  "currency": "EUR",
  "depositedAt": "2026-05-07T10:14:00.000Z"   // optional, defaults to server time
}
```

Response:

```json
{
  "referralId": "65f7a912...",
  "status": "pending_qualification",
  "ftdAt": "2026-05-07T10:14:00.000Z"
}
```

Notes:
- "First deposit" is determined by the operator. If you push a non-first deposit here, affiliar trusts you and treats it as the FTD for referral purposes. Don't push subsequent deposits.
- This endpoint is also idempotent. A second call on a referee already in `pending_qualification` returns the same result without altering `ftdAt`.
- If the referee never signed up via track-signup, this returns `404`. Track-signup is the source of truth — do not try to back-fill referral attribution at FTD time.

### FTD-only mode (alternative)

If your registration system can't easily intercept the referral code at signup, you can skip track-signup and call track-ftd with `referrerPlayerId` included. Affiliar will create the referral and immediately transition to `pending_qualification`. This is convenient but loses the signup→ftd timing data.

```json
{
  "brandId": "...",
  "referrerPlayerId": "p_A",
  "refereePlayerId": "p_B",
  "refCode": "PA-A3F7",
  "depositCents": 5000,
  "currency": "EUR"
}
```

## 5. REST: track-ftd-reversal

Call this when a referee's first deposit is reversed for any reason — chargeback, fraud investigation, manual refund. Affiliar will roll the referral back through its state machine and, if a reward was already paid, fire a `referral.reward.reversed` webhook so your wallet system can claw it back.

```
POST /api/v1/refer/track-ftd-reversal
Content-Type: application/json
Authorization: Bearer <token>

{
  "brandId": "65b4c7a1...",
  "refereePlayerId": "p_B",
  "reversedCents": 5000,                       // amount reversed; usually equals ftdCents
  "reason": "chargeback",                      // free-form, e.g. "chargeback" | "fraud" | "manual_refund"
  "reversedAt": "2026-06-12T14:20:00.000Z"     // optional, defaults to server time
}
```

Response:

```json
{
  "referralId": "65f7a912...",
  "previousStatus": "rewarded",
  "newStatus": "reversed",
  "rewardClawback": {
    "rewardCents": 500,
    "rewardCurrency": "EUR",
    "deliveryId": "65fd1c08...",   // the referral.reward.reversed delivery just queued
    "deliveryStatus": "pending"
  }
}
```

Behaviour by current state of the referral:

| Current state | New state | Webhook fired |
|---|---|---|
| `pending_qualification` | `rejected` (`reversalReason: ftd_reversed`) | None — nothing was paid |
| `qualified` (delivery not yet sent) | `rejected` | None — pending delivery is cancelled |
| `qualified` (delivery sent, ack received) | `reversed` | `referral.reward.reversed` |
| `rewarded` | `reversed` | `referral.reward.reversed` |
| `reversed` / `rejected` | unchanged | None (idempotent no-op) |

Notes:
- Idempotent on `(operatorId, refereePlayerId)`. Re-calling returns the same referral state.
- Affiliar does not arbitrate the reversal — if you say it reversed, it reversed. We just propagate.
- `reversedCents` is recorded for audit but does not need to equal `ftdCents`. The reward we fire to claw back is the original `rewardCents`, not a recalculated amount.

## 6. Webhooks: reward.issued and reward.reversed

When a referral clears qualification gates, Affiliar POSTs `referral.reward.issued` to your configured webhook URL. When a previously rewarded referral is reversed via track-ftd-reversal, Affiliar POSTs `referral.reward.reversed` to the same URL. See [WEBHOOK.md](./WEBHOOK.md) for the full contract: payload shapes, signing, retry policy, idempotency.

The minimum operator-side handler is:

1. Verify the `X-Affiliar-Signature` HMAC.
2. Verify `X-Affiliar-Timestamp` is recent (< 5 minutes).
3. Read `X-Affiliar-Event` — branch on `referral.reward.issued` vs `referral.reward.reversed`.
4. Dedupe on `data.referralId` + event type.
5. Credit (or debit) `data.rewardCents` on player `data.referrerPlayerId`.
6. Return `2xx`.

Operator policy decides exactly how a claw-back materializes — you may zero a bonus that hasn't been wagered, leave already-wagered amounts alone, or surface it as a negative balance. Affiliar does not prescribe.

## 7. Configuring qualification gates

Configure these once per brand in **Affiliar → Settings → Refer-a-Friend**. They apply to every referral on that brand.

| Field | Meaning | Typical value |
|---|---|---|
| `minDepositCents` | Referee's FTD must clear this amount | 1000 (= €10) |
| `holdDays` | Wait N days after FTD before evaluating | 7 |
| `minWagerCents` OR `minWagerMultiple` | Referee must wager this much. Multiple is `× FTD amount`. Whichever is higher. | `minWagerMultiple: 3` |
| `caps.perReferrerMonthlyCents` | Max one referrer earns/month | 10000 (= €100) |
| `caps.perBrandMonthlyCents` | Brand-wide spending cap/month | 1000000 (= €10000) |

Affiliar evaluates gates daily (and on-demand right after track-ftd). When all gates pass, the referral transitions to `qualified` and a reward is queued for delivery.

## 8. Code generation

Codes live entirely on your side. Affiliar treats the `refCode` field on track-signup as opaque metadata — we store it for reporting (so you can see "this referral came from PA-A3F7" in the dashboard) but we never look it up, never enforce uniqueness, and never expose a "lookup by code" endpoint.

Suggested implementation:

- Generate a code per `(brandId, playerId)` lazily, the first time the player taps "Refer a friend"
- Format that's hard to typo and hard to enumerate (e.g. base32 with a checksum, 6-8 chars)
- Store on your own player record; cache aggressively
- When a friend signs up via `?ref=PA-A3F7`, your registration handler resolves `PA-A3F7 → "p_A"` from your own DB, then calls track-signup with both ids

Phase 2 will offer affiliar-managed codes as an opt-in for operators who don't want to manage code generation themselves.

## 9. Edge cases

### Referee deletes their account before qualifying
Operator sends no signal. The referral remains in `pending_qualification` until `holdDays` expires; if `minWager` cannot be reached because the player is gone, qualification stays pending. A Phase 2 expiry job will sweep stale rows automatically; for now, mark it rejected via the admin endpoint or wait it out.

### Referee's FTD is reversed (chargeback / refund)
Call `POST /api/v1/refer/track-ftd-reversal` (see §5). Affiliar handles the state transition and, if a reward was already paid, fires `referral.reward.reversed` so your wallet system can claw back.

### Same referee, multiple brands of one operator
Blocked. The duplicate-referee check is **operator-scoped**, not brand-scoped — a player can only be a referee on one brand of one operator, ever. Cross-brand referee farming is closed at the engine level.

### Same player is both an affiliate and a player on a different brand
The affiliate program takes precedence. If you call track-signup with a `refereePlayerId` that maps to an active Affiliar affiliate, we return `403` with reason `referee_is_affiliate`.

### Same player tries to be referred twice with different referrers
Blocked. First track-signup wins. Second call (different `referrerPlayerId`, same `refereePlayerId`) returns `409`. There is no "swap referrer" flow in Phase 1.

## 10. Testing checklist

Before going live on a brand:

- [ ] Webhook URL is reachable from Affiliar's egress IPs (we'll publish them)
- [ ] Webhook responds 2xx within 10s under load
- [ ] HMAC verification passes for the **"Send test event"** payload (both `reward.issued` and `reward.reversed` variants)
- [ ] Operator-side handler branches on `X-Affiliar-Event` to credit vs debit
- [ ] Idempotency: same `referralId` + event type does not double-credit (or double-debit)
- [ ] Replay flow works: failed delivery → manual replay from dashboard → operator credits/debits
- [ ] track-signup with a self-referral returns 409
- [ ] track-signup with a duplicate refereePlayerId (different referrer) returns 409
- [ ] track-ftd-reversal on a `rewarded` referral fires `reward.reversed`
- [ ] track-ftd-reversal on a `pending_qualification` referral does NOT fire any webhook
- [ ] Disabling the brand toggle stops new track-signups but lets in-flight referrals complete

## 11. SLAs

- track-signup, track-ftd, track-ftd-reversal: P99 < 200ms server-side
- Webhook first-attempt delivery: median < 5s after qualification (or after reversal)

## Related docs

- [SPEC.md](./SPEC.md) — internal feature spec
- [WEBHOOK.md](./WEBHOOK.md) — webhook contract details
- [../integration-guide.md](../integration-guide.md) — main integration doc (auth, activity import, brands)
