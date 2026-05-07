# Refer-a-Friend — Operator Integration Guide

This document is for the operator's product/engineering team enabling a player-to-player referral feature inside their casino. Affiliar provides the engine, the qualification rules, and the reward emission. Your casino owns the player-facing UI (share button, code copy, leaderboards, etc.).

Phase 1 ships with three integration surfaces:

| Surface | Direction | Use |
|---|---|---|
| **REST: code issuance** | operator → affiliar | Get or generate a referral code for a player |
| **REST: track-signup** | operator → affiliar | Tell affiliar a friend signed up using a code |
| **REST: track-ftd** | operator → affiliar | Tell affiliar a friend made their first deposit |
| **Webhook: reward issued** | affiliar → operator | Affiliar tells you to credit the referrer (see [WEBHOOK.md](./WEBHOOK.md)) |

There is intentionally no Kafka path in Phase 1. If you need higher throughput later, raise an issue — Phase 2 reuses the same payload schema over Kafka.

## 1. Player flow, end-to-end

```
Player A in casino UI
  ↓ taps "Refer a friend"
casino backend → affiliar  POST /api/v1/refer/code
  ← { code: "PA-A3F7", link: "https://casino.com/?ref=PA-A3F7" }
casino UI displays code/link, copy + share buttons (your design)

…friend clicks link, lands on signup page with ?ref=PA-A3F7…

Player B fills signup form, casino backend completes signup
casino backend → affiliar  POST /api/v1/refer/track-signup
  with { brandId, refereePlayerId: "p_B", refCode: "PA-A3F7" }
  ← 201 Created  (or 409 if B already a referee anywhere on this operator)

…Player B makes their first deposit…

casino backend → affiliar  POST /api/v1/refer/track-ftd
  with { brandId, refereePlayerId: "p_B", depositCents, currency }
  ← 200 OK

…Player B plays, accumulates wagering, hold period passes…
…Affiliar nightly qualification job clears the gates…

affiliar → operator  POST {your webhook URL}
  with payload { ..., referrerPlayerId: "p_A", rewardCents: 500, ... }
  ← your endpoint credits Player A's wallet, returns 200

Player A sees credited reward in their wallet.
```

## 2. Authentication

All REST endpoints require the same JWT bearer token used elsewhere in Affiliar:

```
Authorization: Bearer <token>
```

The operator account must have `role: "operator"`. See [integration-guide.md §1](../integration-guide.md) for token acquisition.

## 3. REST: code issuance

Get an existing code or have one generated.

```
POST /api/v1/refer/code
Content-Type: application/json
Authorization: Bearer <token>

{
  "brandId": "65b4c7a1...",
  "playerId": "p_A"
}
```

Response:

```json
{
  "code": "PA-A3F7",
  "link": "https://your-casino.com/signup?ref=PA-A3F7",
  "createdAt": "2026-05-07T11:30:20.000Z"
}
```

- The same `(brandId, playerId)` pair always returns the same `code`. Idempotent.
- Code format: `[A-Z0-9]{6,8}`, collision-resistant per brand.
- The `link` field is a convenience — affiliar builds it from the brand's configured `signupUrl` template. If you don't set one, only `code` is returned.

If `enabled === false` in `ReferAFriendConfig` for the brand, this endpoint returns `403`.

## 4. REST: track-signup

Call this once your registration flow has completed for a player who entered (or arrived via) a referral code.

```
POST /api/v1/refer/track-signup
Content-Type: application/json
Authorization: Bearer <token>

{
  "brandId": "65b4c7a1...",
  "refereePlayerId": "p_B",
  "refCode": "PA-A3F7"
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
| 404 | `refCode` does not match any active referrer on this brand |
| 409 | `refereePlayerId` is already a referee (any brand on this operator) |
| 409 | Self-referral: refCode belongs to the same player |
| 403 | Refer-a-Friend disabled for this brand |
| 403 | Referee is also an active affiliate (affiliate program takes precedence) |

This endpoint is **idempotent** on `(brandId, refereePlayerId)`. Re-calling with the same payload returns the existing referral.

## 5. REST: track-ftd

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
- If the referee never signed up via track-signup, this returns `404`. Do not try to back-fill referral attribution at FTD time — track-signup is the source of truth.

### FTD-only mode (alternative)

If your registration system can't easily intercept the referral code at signup, you can skip track-signup and call `POST /api/v1/refer/track-ftd` with the `refCode` field included. Affiliar will create the referral and immediately transition to `pending_qualification`. This is convenient but loses the signup→ftd timing data.

```json
{
  "brandId": "...",
  "refereePlayerId": "p_B",
  "refCode": "PA-A3F7",
  "depositCents": 5000,
  "currency": "EUR"
}
```

## 6. Webhook: reward issued

Once a referral clears qualification gates, Affiliar will POST to your configured webhook URL. See [WEBHOOK.md](./WEBHOOK.md) for the full contract: payload shape, signing, retry policy, idempotency.

The minimum operator-side handler is:

1. Verify the `X-Affiliar-Signature` HMAC.
2. Verify `X-Affiliar-Timestamp` is recent (< 5 minutes).
3. Dedupe on `data.referralId`.
4. Credit `data.rewardCents` to player `data.referrerPlayerId` in your wallet/bonus system.
5. Return `2xx`.

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

## 8. Code generation: who should own it

Two options. Pick one, do not mix:

| Option A: Affiliar owns the code | Option B: Operator owns the code |
|---|---|
| Operator calls `POST /api/v1/refer/code` lazily, caches it on the player record. | Operator generates short codes themselves, registers them via a separate endpoint. |
| Codes are short, collision-checked, brand-scoped. Affiliar manages uniqueness. | Operator ensures uniqueness; affiliar trusts what's submitted. |
| Recommended for Phase 1. | Phase 2; not implemented yet. |

## 9. Edge cases

### Referee deletes their account before qualifying
Operator sends no signal. The referral remains in `pending_qualification` until `holdDays` expires; if `minWager` cannot be reached because the player is gone, qualification stays pending until you call our admin endpoint to mark it rejected, or until a Phase 2 expiry job sweeps stale rows.

### Referee's FTD is reversed (chargeback)
There is no chargeback flow in Phase 1. If the FTD reverses after qualification, the reward has already been emitted. Operator policy decides whether to claw back the referrer's reward; affiliar does not track or reverse it. Phase 2 will add a `referral.reward.reversed` event.

### Same referee, multiple brands of one operator
Blocked. The duplicate-referee check is operator-scoped (`(operatorId, refereePlayerId)` unique), not brand-scoped. A player can be a referee for one brand only.

### Same player is both an affiliate and a player on a different brand
The affiliate program takes precedence. If you call track-signup with a `refereePlayerId` that maps to an active Affiliar affiliate, we return `403` with reason `referee_is_affiliate`.

## 10. Testing checklist

Before going live on a brand:

- [ ] Webhook URL is reachable from Affiliar's egress IPs (we'll publish them)
- [ ] Webhook responds 2xx within 10s under load
- [ ] HMAC verification passes for the **"Send test event"** payload
- [ ] Idempotency: same `referralId` does not double-credit
- [ ] Replay flow works: failed delivery → manual replay from dashboard → operator credits
- [ ] track-signup with a self-referral returns 409 (not silent success)
- [ ] track-signup with a code from a different brand returns 404
- [ ] Disabling the brand toggle stops new track-signups but lets in-flight referrals complete

## 11. SLAs

- track-signup, track-ftd: P99 < 200ms server-side
- code issuance: P99 < 100ms server-side
- Webhook first-attempt delivery: median < 5s after qualification

## Related docs

- [SPEC.md](./SPEC.md) — internal feature spec
- [WEBHOOK.md](./WEBHOOK.md) — webhook contract details
- [../integration-guide.md](../integration-guide.md) — main integration doc (auth, activity import, brands)
