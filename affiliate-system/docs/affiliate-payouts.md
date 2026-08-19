# Affiliate Payouts (USDT-TRC20 via Coinflux)

This doc covers the two real-money outflow paths the affiliate-be drives
through Coinflux: operator → affiliate (`AffiliatePayout`) and affiliate →
sub-affiliate (`SubAffiliatePayout`).

Coinflux is **non-custodial**: it is the approval desk and the record, not a
wallet. We open a withdrawal request, an operator approves it in the Coinflux
dashboard and pays from their own wallet, and a signed webhook tells us the
outcome. No key or balance of ours ever sits at the provider.

## Why one Coinflux tenant funds both

Affiliates and sub-affiliates aren't Coinflux tenants — they're end-users with
a USDT wallet. Every outbound transfer therefore originates from the
operator's own funds. The platform keeps the books straight with an
**internal balance ledger** so the operator never funds the same commission
dollar twice.

## Internal balance ledger

For any affiliate (top-level or sub):

```
earned     = Σ approved CommissionReport.totalCents
paidToMe   = Σ AffiliatePayout to me, status ∈ {pending, processing, paid}
paidToSubs = Σ SubAffiliatePayout I owe, status ∈ {pending, processing, paid}
balance    = earned − paidToMe − paidToSubs
```

`pending` / `processing` / `paid` all count as "reserved spend" — the moment a
payout enters `pending`, the operator's funds are earmarked for it. `draft`
(sub-payouts only), `failed`, `cancelled` don't lock funds.

Helper: [`utils/affiliateBalance.js`](../affiliate-be/utils/affiliateBalance.js) → `computeBalance({ operatorId, affiliateUserId })`.

Used by:
- `GET /api/affiliate-portal/payout-balance` (affiliate sees their own headroom)
- Operator-side `listPending` (subtracts `paidToSubs` from gross before showing payable)
- `dispatchSubPayout` (rejects with `insufficient_balance` if balance < amount)

## The Coinflux surface

### Dispatch

Both `AffiliatePayout` and `SubAffiliatePayout` use the **same** Coinflux
withdrawal call. Lives in [`controllers/affiliate/affiliatePayoutController.js`](../affiliate-be/controllers/affiliate/affiliatePayoutController.js)
as `executeCoinfluxWithdraw({ amountCents, payoutAddress, payoutId, affiliateId })`:

```
POST {COINFLUX_API_URL}/withdrawals
  X-Api-Key: {COINFLUX_API_KEY}
  { playerId, amount, address, reference }
→ { withdrawalId, status: "pending" }
```

- `reference` is our own row id (`payoutId` or `subPayoutId`) — echoed back in
  the webhook, and the primary match key on the way home.
- `playerId` is just a label: the affiliate this payout is for.
- The returned `withdrawalId` is stamped onto the row as
  `providerTransactionId` (the generic "provider tx id" field).

On success the row moves to `processing` and we wait for the webhook.

### Amount conversion

`amountCents` is USD-pegged fiat cents on the row. Coinflux expects whole USDT
formatted to 8 decimals. We assume **USDT ≈ USD 1:1** (`amountCents / 100`).
If commission is ever denominated in a non-USD currency we'll need an FX
conversion step before the network call.

### Webhook callback (single URL)

`https://app.affiliar.co/api/billing/coinflux/callback` serves both deposits
(subscription billing) and withdrawals (payouts). It is whitelisted in
`index.js` `publicAuthPaths` so it bypasses the session-auth gate; the handler
verifies an **HMAC-SHA256** of the raw JSON body against
`COINFLUX_WEBHOOK_SECRET`, compared with `crypto.timingSafeEqual`, from the
`X-Coinflux-Signature` header. A bad signature is a 401, not a soft ignore.

`affiliatePayoutController.handleCoinfluxWithdrawCallback` branches on `event`:

| Event | Route |
|---|---|
| `deposit.credited`, `deposit.rejected` | → `billingController.handleCoinfluxDeposit` (subscription) |
| `withdrawal.approved` | → payout `paid` |
| `withdrawal.declined` | → payout `failed` (+ `failureReason` from `note`) |
| anything else | logged, ack'd, no state change |

Payout matching order:
1. `reference` → `AffiliatePayout.findById`, else `SubAffiliatePayout.findById`
2. fallback: `providerTransactionId === withdrawalId` on either collection

Approved top-level payouts also propagate `paid` to every underlying
`CommissionReport.sourceReportIds`. Sub-payouts don't cascade — they're not
tied to CommissionReports.

## AffiliatePayout (operator → affiliate)

Created from the Commission page's "Pay Selected" batch action or per-row Pay
button on `/payouts`. Bundles **all** of an affiliate's approved
CommissionReports for the period into one Coinflux withdrawal.

### Net payable calculation

Operator's payable to affiliate = `Σ approved CommissionReport.totalCents
− Σ SubAffiliatePayout that affiliate already routed to their subs`.

This is what `listPending`, `createPayout`, and `batchCreate` all return /
write. The `breakdown` on the AffiliatePayout row stores `grossCents`,
`paidToSubsCents`, and the net `amountCents` that actually moved.

### Duplicate guard

A single affiliate can have at most one open (`pending` or `processing`)
payout at a time. Both single-create and batch-create reject duplicates with
409 `already_has_payout` so the operator must cancel or wait for the
outstanding one before creating another.

## SubAffiliatePayout (affiliate → sub)

Created from the Commission page's "Sub-Affiliate Payouts → To my subs" panel
by the parent affiliate themselves. Pre-existing row (status `draft`, written
by `recalculateSubtreePayouts`) transitions through `pending` → `processing` →
`paid` on dispatch.

`POST /api/affiliate-portal/sub-payouts/:id/dispatch`:
1. Verifies the row belongs to the calling affiliate as parent.
2. Snapshots the sub's wallet onto the row (`payoutAddress`, `payoutNetwork`).
3. Checks `computeBalance` — rejects with 409 if balance < payable.
4. Runs `executeCoinfluxWithdraw` with `reference = subPayoutId`.
5. On success: stamps `providerTransactionId`, flips status to `processing`,
   sets `dispatchedAt`.
6. On failure: stamps `failureReason` + `providerResponse`, flips to `failed`.
   Affiliate can retry from the same row.

## Configuration

| Env | Purpose |
|---|---|
| `COINFLUX_API_URL` | defaults to `https://api.coinflux.cash` |
| `COINFLUX_API_KEY` | tenant API key, sent as `X-Api-Key` |
| `COINFLUX_WEBHOOK_SECRET` | HMAC secret for callback verification |

## Test-mode notes

- `COINFLUX_API_KEY` not set → the withdrawal request 401s and the row flips
  to `failed` with `failureReason: "coinflux: HTTP 401"`. The UI surfaces it.
- For local manual smoke testing without Coinflux, the controllers also expose
  `markPaid` endpoints (operator + affiliate sides) that flip the row to
  `paid` without a network call. Useful when reconciling off-platform
  transfers.

## Models

- [`AffiliatePayout`](../affiliate-be/models/AffiliatePayout.js)
- [`SubAffiliatePayout`](../affiliate-be/models/SubAffiliatePayout.js)
- [`User.payoutAddress` + `payoutNetwork`](../affiliate-be/models/User.js)
- [`Operator.affiliatePayoutSettings.minPayoutCents`](../affiliate-be/models/Operator.js)

## Related endpoints

| Endpoint | Purpose |
|---|---|
| `GET /api/affiliate-portal/payout-info` | Affiliate reads their own wallet |
| `PUT /api/affiliate-portal/payout-info` | Affiliate sets their wallet |
| `GET /api/affiliate-portal/payouts` | Affiliate's own payout history |
| `GET /api/affiliate-portal/payout-balance` | Affiliate's internal ledger |
| `POST /api/affiliate-portal/sub-payouts/:id/dispatch` | Affiliate pays a sub |
| `POST /api/affiliate-portal/sub-payouts/:id/cancel` | Cancel pending sub-payout |
| `GET /api/affiliate/payouts/pending` | Operator: per-affiliate net payable |
| `POST /api/affiliate/payouts` | Operator: create single payout |
| `POST /api/affiliate/payouts/batch` | Operator: batch from Commission page |
| `POST /api/affiliate/payouts/:id/dispatch` | Operator: dispatch single |
| `POST /api/affiliate/payouts/:id/cancel` | Operator: cancel pending |
| `POST /api/affiliate/payouts/:id/mark-paid` | Operator: out-of-band reconciliation |
| `GET /api/affiliate/payouts/settings`, `PUT …/settings` | Operator: minPayoutCents threshold |
| `POST /api/billing/coinflux/callback` | Coinflux webhook (deposits + withdrawals) |
