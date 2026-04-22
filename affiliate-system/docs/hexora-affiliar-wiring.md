# Hexora → Affiliar Event Wiring

How the Hexora platform publishes raw events to Affiliar's Kafka, where
each hook lives, and how the NGR formula consumes them.

Companion to [raw-events-integration.md](./raw-events-integration.md) — that
doc is the generic contract for any operator. This one documents the
concrete Hexora-side implementation.

---

## 1. Topology

```
Hexora services                           Affiliar
───────────────                           ────────
auth-management    ──┐
admin-backend      ──┤
player-management  ──┤   Kafka: affiliate.raw.events.v1
bonus-service      ──┤   (broker: 157.90.66.243:9094)
bonus-engine       ──┤                   │
GPMC               ──┘                   ▼
                           affiliate-raw-kafka-consumer
                                   │
                                   ├─ resolves affiliate_id via
                                   │  affiliate-db.affiliateprofiles.referralCodes
                                   │  + hexora-db.players.affiliateReferralCode
                                   │  + LRU cache (playerId → affiliate_id, 10K / 1h)
                                   ├─ normalizes amounts to FX_BASE_CURRENCY (default USD)
                                   │  using affiliate-db.exchangeRates (frankfurter.app, daily)
                                   ├─ upserts affiliateplayers on player.registered
                                   ├─ updates affiliateplayers.status on player.flagged
                                   │
                                   ▼
                          ClickHouse: raw_events (TTL 7d)
                                    + activity_hourly_delta (SummingMergeTree
                                      ORDER BY tenant, brand, player, currency,
                                      hour_bucket, provider)
                                    + activity view (UNION ALL w/ GGR+NGR formula)
```

**Why a separate Kafka broker (9094)?** Hexora's main Kafka (`hexora:9092`)
carries operational traffic (mail, auth, wallet). Affiliar uses its own
broker so one side's backlog/outage doesn't block the other.

**Producer guard**: every emission site short-circuits if any of
`AFFILIATE_KAFKA_BROKERS / AFFILIATE_TENANT_ID / AFFILIATE_BRAND_ID` is
unset. Missing env → silent skip, never a crash.

---

## 2. Event emission points (Hexora side)

### 2.1 `player.registered` — auth-management

`auth-management/auth-server.js`, email-confirm handler. Emitted only on
confirm (not register) so unconfirmed emails never hit Affiliar.

Payload carries `affiliateCode` (from `player.affiliateReferralCode`),
`campaign`, `subId`, `country`. `currency` is **empty** — wallet doesn't
exist yet, consumer treats empty as base currency.

Also upserts the `affiliateplayers` registry in Affiliar-db so the
operator's Players tab lists attributed players right after confirm.

### 2.2 `wallet.deposit.confirmed`

Two emit points; both land in the same event:

- **`admin-backend/controllers/WalletController.js` → deposit** — admin
  manually credits a wallet with `method: "cash"`.
- **`player-management/src/repositories/transactionRepository.js` → updateDepositTransaction**
  — every payment-provider callback that flips a deposit to `"success"`
  runs through here (AlphaPo, Sans-Getirsin, Payzeasy, YumGo, crypto).

`isFirstDeposit` is computed at publish time from
`deposittransactions.count({status: "success"}) - 1`, so CPA commissions
get paired to the right FTD.

### 2.3 `wallet.deposit.chargeback` — player-management `reverseDepositTransaction`

Single funnel for any deposit reversal. Atomically flips the tx to
`"reversed"`, debits the player wallet via wallet-management, then emits
the event. YumGo's webhook already calls it; Payzeasy/AlphaPo/admin
chargeback button will call the same helper when wired.

Payload carries `wasFirstDeposit`. When true the consumer writes
negative `ftd_count` / `ftd_sum_cents` to reverse a CPA commission on a
fraudulent FTD.

### 2.4 `wallet.withdrawal.completed`

- **`admin-backend/WalletController.withdrawal`** (method=`"cash"`) —
  admin-approved cash-out.
- **`player-management/updateWithdrawalTransaction`** (status→success) —
  provider callback path (same guard as deposit: `wasPending` prevents
  double-emit on repeated callbacks).

### 2.5 `wallet.correction.up` / `wallet.correction.down` — admin-backend

Admin-only wallet adjustments — named by **casino P&L direction** (not
by the wallet direction Hexora's UI labels use).

| UI action in admin panel | Endpoint | method | Affiliar event | Casino P&L |
|---|---|---|---|---|
| "Correction Up" in Deposit form | `/wallets/:id/deposit` | `"correction"` | `wallet.correction.down` | casino loses (gift) |
| "Correction Down" in Withdrawal form | `/wallets/:id/withdrawal/:adminId` | `"correction"` | `wallet.correction.up` | casino recovers |

The naming inversion is intentional: Hexora's UI tracks wallet
direction; Affiliar's event tracks casino revenue direction.

### 2.6 Casino events — GPMC

`game-play-management-core/common/affiliate_events.go` runs inside the
goroutine that also publishes the analytics Kafka record, i.e. after
the wallet update has committed:

- `casino.Bet` → `casino.bet.placed`
- `casino.Result` / `casino.Award` → `casino.win.settled`
- `casino.Rollback` → `casino.bet.rollback` + `casino.win.rollback`
  (one per non-zero portion of `rollbackEffects`)

All four carry `providerId` (from `req.GetAggregator()`) so per-provider
GGR lines up on the same delta row.

### 2.7 `bonus.granted` — bonus-service

`bonus-service/main.go::mustCreateBonusWalletWithBonusDefinition` and
`saveBonusWallets`. Amount:
  - `deposit_bonus` / `registration_bonus` → `StartingAmount × 100`
  - `free_spins` → `SpinAmount × StartingSpinCount × 100` (StartingAmount is 0 at
    grant time for free-spin wallets)

### 2.8 `bonus.revoked` — bonus-engine

`bonus-engine/processors/wallet_updater.go::sweepExpiredWallets`, called
by the existing `updateExpiredWallets` + `updateFreeSpinExpiredWallets`
sweeps. Each sweep tags flipped wallets with a unique `revoked_by_sweep`
id so the follow-up `Find` returns exactly the set we flipped
(O(1) queries regardless of batch size).

Unused portion:
  - cash bonus → `Balance × 100`
  - free spin → `(RemainingSpinCount × SpinAmount + Balance) × 100`

### 2.9 `player.flagged` — admin-backend

`admin-backend/controllers/playerController.js`, on `blockPlayer`
(`flag: "disabled"`) and `unblockPlayer` (`flag: "active"`).

### 2.10 `fees.daily.adjustment` — external OR affiliate-be cron

Two sources, mutually exclusive *per category* (see §5):

- **External publisher** publishes `fees.daily.adjustment` directly
  (operators who pre-aggregate fees themselves).
- **affiliate-be fees cron** computes from ClickHouse data + configured
  percentages and writes delta rows directly to
  `activity_hourly_delta` (no Kafka roundtrip for internal cron).

---

## 3. Consumer: resolution, FX, state

### 3.1 affiliate_id resolution

[affiliate-raw-kafka-consumer/src/affiliateResolver.js](../affiliate-raw-kafka-consumer/src/affiliateResolver.js)
keeps two caches:

| Cache | Source | Refresh |
|---|---|---|
| `code → affiliate_id` | `affiliate-db.affiliateprofiles.referralCodes[]` | Background, every 60s |
| `playerId → affiliate_id` | `hexora-db.players.affiliateReferralCode` (lazy lookup + resolve code) | LRU, 10K entries, 1h TTL |

`player.registered` uses `data.affiliateCode` (inline). Every other
event looks up by `event.playerId` and hits the LRU hot.

### 3.2 FX normalization

[affiliate-raw-kafka-consumer/src/fxRates.js](../affiliate-raw-kafka-consumer/src/fxRates.js)
loads rates from `affiliate-db.exchangeRates` (populated by
[affiliate-be/jobs/fxRatesJob.js](../affiliate-be/jobs/fxRatesJob.js),
pulling frankfurter.app daily). Every `*_cents` field in the delta row
is converted from `event.currency` to `FX_BASE_CURRENCY` (default USD)
before insertion. The `currency` column keeps the native code for
`GROUP BY currency` reports.

### 3.3 affiliateplayers registry

On `player.registered`, consumer upserts into
`affiliate-db.affiliateplayers` so operator and affiliate Players tabs
stay populated in real time. On `player.flagged`, writes the new
`status` + `statusUpdatedAt` onto the same doc.

---

## 4. Data model (affiliate-db)

| Collection | Key fields | Source of truth |
|---|---|---|
| `affiliateprofiles` | user, operatorUser, referralCodes[] | Affiliar admin / signup |
| `affiliateplayers` | (operatorId, playerId) unique, affiliateId, affiliateCode, status | Consumer `player.registered` + `player.flagged` |
| `exchangeRates` | (exchange_rate_code) e.g. `EUR_USD` | Daily cron from frankfurter.app |
| `providerfeerates` | (operatorId, brandId, providerId) unique, feePercent | Operator admin UI `/fees` |
| `operatorfinancialsettings` | (operatorId, brandId) unique, payment/jackpot/tax % | Operator admin UI `/fees` |

---

## 5. NGR formula

Canonical SQL is in
[affiliate-raw-kafka-consumer/scripts/clickhouse-activity-view.sql](../affiliate-raw-kafka-consumer/scripts/clickhouse-activity-view.sql).

```
GGR = (bets_sum_cents - casino_bets_rollbacks_sum_cents)
    - (wins_sum_cents - casino_wins_rollbacks_sum_cents)

NGR = GGR
    - bonus_issues_sum_cents
    - chargebacks_sum_cents
    - corrections_down_sum_cents    (casino gifted money)
    + corrections_up_sum_cents      (casino recovered money)
    - additional_deductions_sum_cents
    - casino_taxes_sum_cents
    - payment_system_fees_sum_cents
    - jackpot_fees_sum_cents
    - game_provider_fees_sum_cents
```

`bonus.revoked` writes a **negative** delta to
`bonus_issues_sum_cents` so a granted-but-never-used bonus nets out.

---

## 6. Fees system

### 6.1 Configuration (per-operator, optionally per-brand)

- Global percentages: `payment_system`, `jackpot`, `casino_tax`
- Per-provider revenue share: `feePercent` per `providerId`
- All with optional `brandId`; `null` = operator-default, a specific
  brand `_id` = override for that brand.

Resolution order per (brand, provider):
1. Brand-specific provider rate → else
2. Operator-default provider rate → else
3. 0% (no deduction)

### 6.2 Daily cron

[affiliate-be/jobs/feesDailyJob.js](../affiliate-be/jobs/feesDailyJob.js)
— runs 1 minute after boot and then every 24h. Default `dayOffset = -1`
(yesterday). Flow:
1. For each non-deleted operator, build (brandId → financials) and
   ((brandId, providerId) → feePercent) maps once.
2. `SELECT GROUP BY (brand, affiliate, currency, provider)` over the
   target day's delta, `HAVING bets + deposits > 0`.
3. Per row: compute each fee bucket, skip the row if all fees are 0.
4. `INSERT INTO activity_hourly_delta` with `player_id = "__fees__"` as
   a marker to keep rows out of per-player reports.

### 6.3 Operator UI

`/fees` in the operator dashboard (top-level nav). Scope selector lets
the operator pick "Operator default" or any brand, and the forms /
tables query with `?brandId=<scope>` so editing and viewing stay in
sync. Manual "Run for today (test)" button passes `dayOffset: 0` for
ad-hoc verification.

### 6.4 Double-counting rule

Mixed sources are fine across **different** categories (e.g. publish
`gameProviderFeesCents` yourself while letting Affiliar compute payment
fees from a configured %). Mixing within the **same** category
double-counts — the UI banner spells this out.

---

## 7. FE surfaces

| Page | Role | File |
|---|---|---|
| Dashboard | affiliate | [pages/affiliate-portal/dashboard/index.tsx](../../affiliate-fe/src/pages/affiliate-portal/dashboard/index.tsx) — KPI cards, Adjustments section, Providers breakdown |
| Players | affiliate | [pages/affiliate-portal/players/index.tsx](../../affiliate-fe/src/pages/affiliate-portal/players/index.tsx) — status badge, lifetime metrics from ClickHouse |
| Commission | affiliate | existing |
| Fees | operator | [pages/fees/index.tsx](../../affiliate-fe/src/pages/fees/index.tsx) — scope selector, settings form, provider rates table, manual run |

---

## 8. API endpoints (added since initial wiring)

| Endpoint | Who | Notes |
|---|---|---|
| `GET /api/affiliate-portal/providers` | affiliate / operator | per-provider metrics + configured fee % |
| `GET /api/players` / `GET /api/players/detail/:playerId` | operator / affiliate | registry row + ClickHouse lifetime metrics |
| `GET /api/fees/brands` | operator | scope dropdown source |
| `GET/PUT/DELETE /api/fees/provider-rates` | operator | scope via `brandId` |
| `GET/PUT /api/fees/settings` | operator | scope via `brandId` |
| `POST /api/fees/run` | operator | body `{ dayOffset }` (-1 default) |

---

## 9. Environment variables

### Hexora publishers

```
AFFILIATE_KAFKA_BROKERS=157.90.66.243:9094
AFFILIATE_TENANT_ID=69d68b885946ea65a9d805db     # operators._id
AFFILIATE_BRAND_ID=69d692da55284f229ad805db      # brands._id (hexora.bet)
AFFILIATE_RAW_EVENTS_TOPIC=affiliate.raw.events.v1
```

### Consumer

```
MONGODB_URI=mongodb://affiliateAdmin:…@localhost:27017/affiliate?authSource=affiliate
MONGODB_DATABASE=affiliate
HEXORA_MONGODB_URI=mongodb://localhost:27017/hexora-db
HEXORA_MONGODB_DATABASE=hexora-db
AFFILIATE_CACHE_REFRESH_MS=60000
PLAYER_CACHE_MAX_SIZE=10000
PLAYER_CACHE_TTL_MS=3600000
FX_BASE_CURRENCY=USD
FX_REFRESH_MS=300000
```

### affiliate-be

```
FX_BASE_CURRENCY=USD                              # rates stored as X → USD
FX_SUPPORTED_CURRENCIES=USD,EUR,TRY,GBP,INR,JPY
FX_JOB_REFRESH_MS=86400000                        # 24h
FEES_JOB_REFRESH_MS=86400000
FEES_JOB_INITIAL_DELAY_MS=60000
```

---

## 10. Data invariants & gotchas

### 10.1 `affiliateprofiles.operatorUser` must be set

Commission calculation filters profiles by
`{ operatorUser: operator._id }`. Null means the affiliate is invisible
to the operator's reports.

### 10.2 `affiliate_id` in ClickHouse = User `_id`

Not `profile.affiliateId`. The commission idMap self-references
`profile.user → profile.user` so downstream queries match.

### 10.3 `player.affiliateReferralCode` is immutable

Written once at register; every lookup path (consumer, publishers,
reports) assumes this. Don't add mutate paths.

### 10.4 Stale client-side affiliate codes

`affiliateTracking.ts` caches the code for 30 days in localStorage.
Stale values still get stored on new players' docs and silently fail
resolution (empty `affiliate_id`). First troubleshooting step when an
affiliate says "my player isn't showing up".

### 10.5 `Brand.operatorId` refs User, not Operator

The field name is misleading. `Brand.operatorId` = the operator user's
`_id`, not the tenant Operator document id. feesController.listBrands
uses `req.affiliateUser._id` for that reason.

### 10.6 SummingMergeTree ORDER BY includes `provider`

Per-provider GGR only stays separated because provider is in the sort
key. Changing ORDER BY requires a table recreate — don't try to ALTER.

### 10.7 ClickHouse views reference column names verbatim

Adding a column means rebuilding the `affiliate.activity` view
afterwards. The checkpointed DDL is in
`affiliate-raw-kafka-consumer/scripts/clickhouse-activity-view.sql`.

### 10.8 Hexora UI "Correction Up/Down" vs Affiliar event names

Hexora's admin UI labels track **wallet direction**: "Correction Up"
(Deposit form) increases the wallet. Affiliar events track **casino P&L
direction**: the inverse. `method=correction` on `/deposit` →
`wallet.correction.down`; on `/withdrawal` → `wallet.correction.up`.

### 10.9 Currency on register events

`player.registered` sends `currency: ""`. Wallet currency isn't chosen
until later. Consumer treats empty as base currency for FX (no-op).

---

## 11. Open work

- [ ] Wire the rest of the payment providers (Payzeasy, AlphaPo) to
      `reverseDepositTransaction` when their chargeback webhooks are
      implemented.
- [ ] Admin UI button for manual chargeback (calls the same helper).
- [ ] Self-exclusion flow — none today in Hexora; add emission when it
      lands.
- [ ] Duplicate / fraud-detection events (also currently absent).
- [ ] KYC/verified transition → `player.flagged { flag: "active" }`.
- [ ] Extend multi-brand support beyond fee settings (if operator
      reports need brand filters beyond what the view already offers).
