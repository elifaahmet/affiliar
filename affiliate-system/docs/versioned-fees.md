# Versioned Fees

Fee configuration is **effective-dated**. Every save writes a new row
with `effectiveFrom: now` and closes the previous active row's
`effectiveUntil`. The daily fees job picks the version that was active
*on the day being processed* — so historical reports stay frozen, and
re-running yesterday with today's UI doesn't silently rewrite last
month's NGR.

## The bug this fixes

Before versioning, `OperatorFinancialSettings` and `ProviderFeeRate` were
single-row-per-(operator, brand[, provider]) documents that the UI
mutated in place. The cron + manual recalc both read these documents
fresh on every run.

Effect: bumping a fee from 30% to 35% mid-month → next time the cron
processed yesterday, last week's reports recomputed with 35% and the
operator-facing NGR moved. Operators told us about it.

## Schema

Both `OperatorFinancialSettings` and `ProviderFeeRate` gained:

```js
effectiveFrom:  { type: Date, default: Date.now, index: true }
effectiveUntil: { type: Date, default: null,    index: true }
```

`effectiveUntil: null` ≡ this row is currently active. Historical rows
carry the date they were superseded.

### Partial unique indexes

The old `{operatorId, brandId}` unique index would break under
versioning (multiple historical rows per pair). Replaced with:

```js
operatorFinancialSettingsSchema.index(
  { operatorId: 1, brandId: 1, effectiveUntil: 1 },
  { unique: true, partialFilterExpression: { effectiveUntil: null } },
);
```

→ "at most one active row per (operator, brand)". Same pattern for
`ProviderFeeRate` (adds `providerId` to the tuple).

A migration script ([`scripts/migrate-fee-versioning.js`](../affiliate-be/scripts/migrate-fee-versioning.js))
backfills `effectiveFrom = createdAt` on existing docs, drops the legacy
indexes, and rebuilds the new partial-unique ones. Idempotent.

## Helper module

[`utils/feeVersioning.js`](../affiliate-be/utils/feeVersioning.js):

- `saveFinancialsVersion({ operatorId, brandId, patch, asOfDate })` —
  merge `patch` onto the current active row (dot-notation supported),
  close the old row, insert a new active row.
- `saveProviderRateVersion({ operatorId, brandId, providerId, … })` —
  same pattern. Soft-delete is a new version with `isDeleted: true`.
- `resolveFinancialsAsOf({ operatorId, brandId, asOfDate })` — return
  the row active on `asOfDate`. Falls back to operator-wide
  (`brandId: null`) if the brand-scoped chain has no version for that
  date.
- `resolveProviderRatesAsOf({ operatorId, asOfDate })` — aggregation
  pipeline that returns one row per `(brandId, providerId)`, picking
  the latest version whose `[effectiveFrom, effectiveUntil)` window
  covers `asOfDate`. `isDeleted` rows are filtered out.

## Fees job changes

[`jobs/feesDailyJob.js`](../affiliate-be/jobs/feesDailyJob.js):

`boundsForDate(date)` returns the (fromTs, toTs, hourBucket, **asOfDate**)
quadruple. `asOfDate` flows into `runForOperator` and drives the
resolver:

```js
const resolveDate = applyCurrentFees ? new Date() : bounds.asOfDate;
const providerRates  = await resolveProviderRatesAsOf({ operatorId, asOfDate: resolveDate });
const financialCache = new Map(); // memoize per brand within the run
const resolveFinancials = async (brandId) => {
  const cached = financialCache.get(brandId || 'default');
  if (cached) return cached;
  const row = await resolveFinancialsAsOf({ operatorId, brandId, asOfDate: resolveDate });
  financialCache.set(brandId || 'default', row);
  return row;
};
```

The nightly cron passes `applyCurrentFees: false` (the default), so it
always uses the version active on the day being processed. The manual
recalc endpoint accepts `applyCurrentFees: true` for deliberate
retroactive overwrites.

## Manual recalculation surface

[`controllers/affiliate/feesController.js`](../affiliate-be/controllers/affiliate/feesController.js) →
`POST /api/fees/run` accepts two shapes:

```jsonc
// Legacy: relative offset
{ "dayOffset": -1 }

// Date range (preferred)
{ "dateFrom": "2026-05-01", "dateTo": "2026-05-10",
  "applyCurrentFees": false }
```

- Max 90 days per call.
- `applyCurrentFees: false` (default) → each day uses its historical fee
  snapshot. Idempotent — re-running produces identical numbers.
- `applyCurrentFees: true` → all days use today's active version.
  Operator opts in deliberately (UI shows a confirmation dialog
  spelling out the trade-off).

History endpoints for admin tooling:

- `GET /api/fees/settings/history?brandId=&limit=` — version chain for
  `OperatorFinancialSettings`.
- `GET /api/fees/provider-rates/history?brandId=&providerId=&limit=` —
  version chain for `ProviderFeeRate`.

## Frontend

[`pages/fees/index.tsx`](../affiliate-fe/src/pages/fees/index.tsx) →
`RunFeesButton` rewritten:

- Date pickers (From / To). Default is yesterday→yesterday.
- Dynamic "Re-run N days" button label (calculates inclusive day count).
- "Apply current fees retroactively" checkbox with explanatory text.
- `window.confirm` gate on the retroactive path before the POST fires.

## What didn't change

- Read endpoints (`GET /api/fees/provider-rates`, `GET /api/fees/settings`)
  still return only the active version (`effectiveUntil: null`). The
  history lives behind dedicated `/history` endpoints.
- `OperatorFinancialSettings.defaults` (the CPA gate defaults used at
  commission-calc time) is part of the versioned doc, so the same
  version-pick semantics apply there too. CommissionReport already
  snapshots `planSnapshot.resolvedSettings` at calc time so historical
  reports don't depend on the live row.
- The bulk-upsert path for provider rates loops serially (one
  `saveProviderRateVersion` per row) instead of the old `bulkWrite`.
  CSV imports are tens-to-low-hundreds of rows, so the cost is
  negligible vs the gain of consistent versioning.
