# Hexora → Affiliar Event Wiring

How the Hexora platform publishes raw events to Affiliar's Kafka, where
each hook lives, and how the NGR formula consumes them.

Companion to [raw-events-integration.md](./raw-events-integration.md) — that
doc is the generic contract for any operator. This one documents the
concrete Hexora-side implementation.

---

## 1. Topology

```
Hexora services                            Affiliar
───────────────                            ────────
auth-management  ──┐
admin-backend    ──┤  Kafka: affiliate.raw.events.v1
player-management ─┤  (broker: 157.90.66.243:9094)
(casino/bets — TBD)┘             │
                                 ▼
                   affiliate-raw-kafka-consumer
                          │
                          ├─ resolves affiliate_id via:
                          │    • affiliate-db.affiliateprofiles.referralCodes
                          │    • hexora-db.players.affiliateReferralCode
                          │    • LRU cache (playerId → affiliate_id, 10K / 1h)
                          │
                          ▼
                  ClickHouse: raw_events (TTL 7d)
                             + activity_hourly_delta (SummingMergeTree)
                             + activity view (UNION ALL over aggregated+raw)
```

**Why a separate Kafka broker (9094)?** Hexora's main Kafka (`hexora:9092`)
carries operational traffic (mail, auth, wallet). Affiliar uses its own
broker so one side's backlog/outage doesn't block the other.

**Producer guard**: every emission site short-circuits if any of
`AFFILIATE_KAFKA_BROKERS / AFFILIATE_TENANT_ID / AFFILIATE_BRAND_ID` is
unset. Missing env → silent skip, never a crash.

---

## 2. Event emission points (Hexora side)

### 2.1 `player.registered` — `auth-management/auth-server.js`

Emitted from the email-confirm handler (NOT register), so only
confirmed players are tracked. Attribution comes from
`player.affiliateReferralCode`, which `authController.register` writes
when the client sends an `affiliateId` or `referralCode` query param.

**No local lookup**: Hexora used to try resolving `affiliateId` against
its own `adminusers` collection. That was wrong — Hexora doesn't own
affiliate data. The lookup was removed. The raw referral code string is
forwarded as-is and Affiliar resolves it on its side.

```js
data: {
  country: player.verify1?.countryId || request.headers["cf-ipcountry"] || "",
  affiliateCode: String(player.affiliateReferralCode),
  campaign: player.affiliateCampaign || "",
  subId: player.affiliateSubId || "",
}
```

### 2.2 `wallet.deposit.confirmed`

Two emission points — BOTH funnel into the same event:

- **`admin-backend/mono-backend/controllers/WalletController.js` → `deposit`**
  (admin manual deposit / correction; [affiliateEvents.js](../admin-system/admin-backend/mono-backend/utils/affiliateEvents.js))
- **`player-management/src/repositories/transactionRepository.js` → `updateDepositTransaction`**
  (any payment-provider callback: AlphaPo, Sans, Payzeasy, crypto;
  [affiliateEvents.js](../player-system/player-backend/management-services/player-management/src/utils/affiliateEvents.js))

The player-management hook is guarded by a **previous-status check** so
repeated provider callbacks don't double-count:

```js
if (existing.status?.toLowerCase() !== "success") {
  void publishDepositConfirmed(...);
}
```

`isFirstDeposit` is computed per emit by counting prior `success`
deposits — this lives on the publish side, not the consumer, because
only Hexora has authoritative history.

### 2.3 `wallet.withdrawal.completed` — `player-management` only

Hooked into `updateWithdrawalTransaction` inside the
`if (status === "success" && wasPending)` branch. The `wasPending`
guard is the dedup mechanism — same pattern as deposit. Admin-backend's
`approveWithdrawalTransaction` does NOT emit directly; it forwards to a
payment provider whose callback eventually lands here.

### 2.4 Casino events — **not wired yet**

`casino.bet.placed`, `casino.win.settled`, rollbacks. Hook point TBD —
most likely the coco-gamings adapter or `casino-risk-management`.

---

## 3. Consumer: affiliate-id resolution

[affiliate-raw-kafka-consumer/src/affiliateResolver.js](../affiliate-system/affiliate-raw-kafka-consumer/src/affiliateResolver.js)
maintains two caches:

| Cache | Source | Refresh |
|---|---|---|
| `code → affiliate_id` | `affiliate-db.affiliateprofiles.referralCodes[]` | Background, every 60s |
| `playerId → affiliate_id` | `hexora-db.players.affiliateReferralCode` (lazy lookup + resolve code) | LRU, 10K entries, 1h TTL |

Resolution strategy per event:
- `player.registered` → use `data.affiliateCode` (inline in event).
- Any other event → look up `event.playerId` in `hexora-db.players`,
  get `affiliateReferralCode`, then resolve via the code cache.

The playerId cache kills the per-event Mongo roundtrip for high-volume
event types (bets, wins). Attributions are immutable post-registration
so the TTL is mostly a self-healing safety net.

**Two Mongo connections**: the consumer holds clients for both
`affiliate` (authenticated) and `hexora-db` (localhost direct). Neither
authSource crosses DBs.

---

## 4. Casino NGR formula (read side)

Calculated over `activity_hourly_delta` + the aggregated view via
SummingMergeTree rollups. The metrics layout is documented in
[raw-events-integration.md §4](./raw-events-integration.md).

```
net_bets  = bets_sum_cents  - casino_bets_rollbacks_sum_cents
net_wins  = wins_sum_cents  - casino_wins_rollbacks_sum_cents

casino_ngr = net_bets
           - net_wins
           - bonus_issues_sum_cents
           - additional_deductions_sum_cents
           - casino_taxes_sum_cents
```

**All bets/wins land in the gross columns — no filtering by bonus flag.**
An earlier iteration excluded bonus-funded bets from `bets_sum_cents`,
but the formula already neutralises bonus cost via
`bonus_issues_sum_cents`. Excluding twice would under-count revenue for
the scenarios where a bonus is used (see §5).

---

## 5. Bonus accounting scenarios

The accounting problem: bonuses are recognised at grant time, but may
never be consumed. Worked scenarios (assume $100 bonus):

| Scenario | bets | wins | bonus_issues | NGR | Correct? |
|---|---|---|---|---|---|
| A — granted, never used (expires) | 0 | 0 | 100 | −100 | ❌ over-counts cost |
| A — with `bonus.revoked` | 0 | 0 | 0 (100 + −100) | 0 | ✅ |
| B — wagered, all lost | 100 | 0 | 100 | 0 | ✅ |
| C — wagered, won $150 cashable | 100 | 150 | 100 | −150 | ✅ (real payout) |

`bonus.revoked` was added specifically to close scenario A: when an
unused bonus expires or is cancelled, emit it with the grant amount so
the consumer writes `bonus_issues_sum_cents = -amountCents`.
SummingMergeTree nets it against the original grant.

---

## 6. Environment variables

Every Hexora publisher needs these four:

```bash
AFFILIATE_KAFKA_BROKERS=157.90.66.243:9094
AFFILIATE_TENANT_ID=69d68b885946ea65a9d805db   # affiliate-db.operators._id (Hexora)
AFFILIATE_BRAND_ID=69d692da55284f229ad805db    # affiliate-db.brands._id (hexora.bet)
AFFILIATE_RAW_EVENTS_TOPIC=affiliate.raw.events.v1
```

Consumer needs:

```bash
MONGODB_URI=mongodb://affiliateAdmin:…@localhost:27017/affiliate?authSource=affiliate
MONGODB_DATABASE=affiliate
HEXORA_MONGODB_URI=mongodb://localhost:27017/hexora-db
HEXORA_MONGODB_DATABASE=hexora-db
AFFILIATE_CACHE_REFRESH_MS=60000
PLAYER_CACHE_MAX_SIZE=10000
PLAYER_CACHE_TTL_MS=3600000
```

---

## 7. Open work

- [ ] `casino.bet.placed` / `casino.win.settled` emission — hook point in casino/adapter stack TBD
- [ ] `casino.bet.rollback` / `casino.win.rollback`
- [ ] `wallet.deposit.chargeback` — hook on chargeback flow in admin-be / payment callbacks
- [ ] `bonus.granted` / `bonus.revoked` — bonus service emission
- [ ] `fees.daily.adjustment` — daily cron (admin-be or affiliate-be)
- [ ] `player.flagged` — admin ban / self-exclusion flow
