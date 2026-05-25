# Affiliate Payouts (USDT-TRC20 via Sans Getirsin)

This doc covers the two real-money outflow paths the affiliate-be drives
through the operator's Sans Getirsin merchant account: operator → affiliate
(`AffiliatePayout`) and affiliate → sub-affiliate (`SubAffiliatePayout`).

## Why one merchant funds both

Affiliates and sub-affiliates aren't Sans merchants — they're end-users
with a USDT wallet. Every outbound transfer therefore originates from the
operator's Sans balance. The platform keeps the books straight with an
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

`pending` / `processing` / `paid` all count as "reserved spend" — the
moment a payout enters `pending`, the operator's Sans balance is
earmarked for it. `draft` (sub-payouts only), `failed`, `cancelled` don't
lock funds.

Helper: [`utils/affiliateBalance.js`](../affiliate-be/utils/affiliateBalance.js) → `computeBalance({ operatorId, affiliateUserId })`.

Used by:
- `GET /api/affiliate-portal/payout-balance` (affiliate sees their own headroom)
- Operator-side `listPending` (subtracts `paidToSubs` from gross before showing payable)
- `dispatchSubPayout` (rejects with `insufficient_balance` if balance < amount)

## The Sans surface

### 3-step dispatch

Both `AffiliatePayout` and `SubAffiliatePayout` use the **same** Sans
withdrawal flow. Lives in [`controllers/affiliate/affiliatePayoutController.js`](../affiliate-be/controllers/affiliate/affiliatePayoutController.js)
as `executeSansWithdraw({ operator, amountCents, payoutAddress, payoutNetwork, extraData })`:

1. `POST /payment/json` — merchant token (cached 18 min per operator).
   `additionalData: { userId: operatorId, maxWithdrawLimit: 6000, paymentMethod: 9 }`.
2. `GET /payment/withdraw?amount=X.XXXXXXXX` — list withdraw accounts.
   Returns `data[0]._id` (bank) and `data[0].withdrawFields[]` (the form
   spec — typically `Wallet` + `Chain`).
3. `POST /payment/withdraw { bank, amount, fields, extraData }` — create
   the transfer. Response carries the `transactionId` we stamp onto the
   payout row as `sansTransactionId`.

### Amount conversion

`amountCents` is USD-pegged fiat cents on the row. Sans expects whole USDT
formatted to 8 decimals. We assume **USDT ≈ USD 1:1** (`amountCents / 100`).
If commission is ever denominated in a non-USD currency we'll need an FX
conversion step before the network call.

### Webhook callback (single URL)

Sans only supports one callback URL per merchant. We use
`https://app.affiliar.co/api/billing/sans/callback` for both deposits and
withdrawals. `billingController.handleSansCallback` branches on
`payload.type` (case-insensitive):

- `DEPOSIT` → existing billing-transaction path (subscription payments).
- `WITHDRAW` → `affiliatePayoutController.handleSansWithdrawCallback`,
  which discriminates further:
  - `extraData.subPayoutId` present → `SubAffiliatePayout`
  - Otherwise → `AffiliatePayout` (match by `sansTransactionId`, fall back
    to `extraData.payoutId`)

Status mapping (case-insensitive):

| Provider status | Our status |
|---|---|
| `APPROVED`, `SUCCESS`, `COMPLETED` | `paid` |
| `REJECTED`, `FAILED`, `DECLINED` | `failed` (+ `failureReason`) |
| anything else | logged, ack'd, no state change |

Approved top-level payouts also propagate `paid` to every underlying
`CommissionReport.sourceReportIds`. Sub-payouts don't cascade — they're
not tied to CommissionReports.

## AffiliatePayout (operator → affiliate)

Created from the Commission page's "Pay Selected" batch action or
per-row Pay button on `/payouts`. Bundles **all** of an affiliate's
approved CommissionReports for the period into one Sans transaction.

### Net payable calculation

Operator's payable to affiliate = `Σ approved CommissionReport.totalCents
− Σ SubAffiliatePayout that affiliate already routed to their subs`.

This is what `listPending`, `createPayout`, and `batchCreate` all return /
write. The `breakdown` on the AffiliatePayout row stores `grossCents`,
`paidToSubsCents`, and the net `amountCents` that actually moved.

### Duplicate guard

A single affiliate can have at most one open (`pending` or `processing`)
payout at a time. Both single-create and batch-create reject duplicates
with 409 `already_has_payout` so the operator must cancel or wait for the
outstanding one before creating another.

## SubAffiliatePayout (affiliate → sub)

Created from the Commission page's "Sub-Affiliate Payouts → To my subs"
panel by the parent affiliate themselves. Pre-existing row (status
`draft`, written by `recalculateSubtreePayouts`) transitions through
`pending` → `processing` → `paid` on dispatch.

`POST /api/affiliate-portal/sub-payouts/:id/dispatch`:
1. Verifies the row belongs to the calling affiliate as parent.
2. Snapshots the sub's wallet onto the row (`payoutAddress`,
   `payoutNetwork`).
3. Checks `computeBalance` — rejects with 409 if balance < payable.
4. Resolves an operator user under the same tenant (we need their
   identity for the Sans token call) and runs `executeSansWithdraw`.
5. On success: stamps `sansTransactionId`, flips status to `processing`,
   sets `dispatchedAt`.
6. On failure: stamps `failureReason` + `sansResponse`, flips to
   `failed`. Affiliate can retry from the same row.

## Test-mode notes

- `BILLING_PROVIDER_API_KEY` not set → `getSansToken` throws and the
  dispatch row flips to `failed` with `failureReason: "token: …"`. UI
  surfaces it.
- For local manual smoke testing without Sans, the controllers also
  expose `markPaid` endpoints (operator + affiliate sides) that flip
  the row to `paid` without a network call. Useful when reconciling
  off-platform transfers.

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
