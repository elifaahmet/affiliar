# Commission Plan Types

The `CommissionPlan` model supports five plan types. Each is exposed as
a tile on the operator's New/Edit Commission Plan page (a dedicated
route at `/commission/new` and `/commission/:id/edit` — not a modal,
because losing a half-typed plan to a stray backdrop click was real).

Which types an operator can pick is gated by their subscription plan's
`commissionTypes` flag (see `utils/planLimits.js`).

## revshare

Percentage of the affiliate's product NGR or GGR.

- `revshare.metric` — `"ngr"` | `"ggr"` | `null` (inherit operator default).
- `revshare.rate` — 0–100 percentage.
- `revshare.includePaymentFees` — when `false`, deposit/withdrawal/PSP
  fees are added back to NGR so the share is taken on "gross NGR". `null`
  inherits.

Engine: [`engine/commissionEngine.calcRevshare`](../affiliate-be/engine/commissionEngine.js).
NGR/GGR base picked by `plan.product` (casino / sportsbook / combined)
via `pickProductPair`.

## cpa

Fixed amount per qualifying FTD. Gates evaluated at FTD time using the
FTD's context (lifetime deposit count is always 1 at FTD time, by
definition).

- `cpa.amountCents`, `cpa.currency`.
- `cpa.qualification` block: `minDepositCents`, `minWagerCents`,
  `minWagerMultiple`, `holdDays`, `minCashRetentionCents`,
  `minKycLevel`, `minDepositsCount`, `requirePositiveNgr`,
  `depositBasis` (`"gross"` | `"net"`).

Engine: per-FTD evaluator in
[`engine/cpaQualification.js`](../affiliate-be/engine/cpaQualification.js).
Reads `fetchFtdContextRows` per (affiliate, period).

## hybrid

revshare + cpa simultaneously. Both blocks active, both engines run.

## tiered_revshare

NGR-band-based variable revshare rate.

```js
tiers: [
  { fromCents: 0,       toCents: 1000000,  rate: 25 },
  { fromCents: 1000000, toCents: 5000000,  rate: 30 },
  { fromCents: 5000000, toCents: null,     rate: 35 },
]
```

The tier whose `[fromCents, toCents)` contains the period's NGR is
applied. `toCents: null` means "unbounded".

## fixed (per qualified player) — shipped

Pays `fixed.amountCents` **once per player ever**, in the period that
player first clears every active qualification gate.

### Why this is different from CPA

CPA is anchored on the FTD event. Fixed is anchored on the
*qualification moment*. So a gate like "min 3 deposits" actually works
on Fixed (the player has to deposit 3 times to qualify) where it would
never trigger on CPA (FTD = 1 deposit, full stop).

### Configuration

```js
fixed: {
  amountCents: 5000,           // $50 per qualified player
  currency: "USD",
  qualification: {
    minDepositCents: null,     // FTD-time floor (rejected if FTD below)
    minDepositsCount: 3,       // lifetime deposit count — NEW gate
    holdDays: 7,
    minWagerCents: null,
    minWagerMultiple: null,
    minCashRetentionCents: null,
    minKycLevel: null,
    requirePositiveNgr: true,  // lifetime NGR > 0 — NEW gate
    depositBasis: null,        // gross | net | null
  },
}
```

The two new gates (`minDepositsCount`, `requirePositiveNgr`) also live
on `cpa.qualification` — they're shared. Operators using CPA can require
them too.

### Engine path

1. `commissionController.calculate` pulls per-player cumulative context
   for the operator via
   [`fetchPlayerCumulativeContext`](../affiliate-be/controllers/affiliate/commissionController.js) —
   every player who has ever FTD'd, with lifetime metrics up to the
   period end (deposits count, deposit sum, cashouts, wager, NGR, FTD
   date, KYC level).
2. Per affiliate's subtree, filter to relevant players. For each one:
   - Evaluate gates via
     [`engine/fixedQualification.checkFixedQualification`](../affiliate-be/engine/fixedQualification.js).
   - Skip players already in `priorFixedPaidByKey` (loaded from earlier
     CommissionReports' `fixedPaidPlayerIds[]`).
3. Engine: `commissionEngine` `fixed` case →
   `fixedAmountCents = plan.fixed.amountCents × newlyQualifiedCount`.
4. The newly-qualified player IDs are persisted onto the new
   CommissionReport's `fixedPaidPlayerIds` so subsequent periods know
   they've been paid.

### Settings resolver

[`engine/commissionSettings.resolveFixedSettings(plan, operatorDefaults)`](../affiliate-be/engine/commissionSettings.js)
mirrors `resolveCommissionSettings` for the CPA shape — same merge
priority (plan field → operator default → hard default) — but reads
from `plan.fixed.qualification` and includes the two extra gates.

## Plan-product axis

Each plan has a `product` field (`"casino"` | `"sportsbook"` |
`"combined"`) that picks which NGR / GGR base the engine consumes. An
affiliate's `AffiliateProfile.commissionPlans` map holds one plan per
product (`casino`, `sportsbook`, `combined`) so they can earn on each
product independently or via the combined-NGR view.

`calculate()` iterates the three product slots per affiliate and writes
one CommissionReport per slot that has a plan attached. See
[`commission-plans-product-scoping`](#commission-plans-product-scoping)
in `integration-guide.md` for the cascade math (TODO: link section
exists only in the long-form code comments today).

## Plan-gate by subscription tier

From `utils/planLimits.js`:

| Plan ($/mo) | Allowed commission types |
|---|---|
| tier1 ($53) | revshare, cpa |
| tier2 ($98) | revshare, cpa, hybrid, tiered_revshare, **fixed** |
| plus ($494) | revshare, cpa, hybrid, tiered_revshare, fixed |
| plusL2 ($998) | revshare, cpa, hybrid, tiered_revshare, fixed |
| pro ($1799) | revshare, cpa, hybrid, tiered_revshare, fixed |

The tier1 plan deliberately stays minimal — operators on the smallest
tier get the two simplest reward shapes and graduate to the rest as
their program scales.
