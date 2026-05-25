const clickhouse = require("../config/clickhouse");
const Operator = require("../models/Operator");
const OperatorFinancialSettings = require("../models/OperatorFinancialSettings");
const ProviderFeeRate = require("../models/ProviderFeeRate");
const { logger } = require("../middlewares/logger");
const { computeFeesForBucket } = require("./computeFees");
const {
  resolveFinancialsAsOf,
  resolveProviderRatesAsOf,
} = require("../utils/feeVersioning");

// Runs at 00:10 UTC daily and computes yesterday's fees per
// (operator, brand, affiliate, provider) from ClickHouse. Each row's
// fees get written back as a delta into activity_hourly_delta at the
// starting hour of yesterday (the hour_bucket is part of the SummingMergeTree
// key, so one row per day per combination).

const REFRESH_MS = parseInt(
  process.env.FEES_JOB_REFRESH_MS || String(24 * 60 * 60 * 1000),
  10,
);
// Initial offset from boot so the first run happens slightly after the top of
// the hour instead of right at startup.
const INITIAL_DELAY_MS = parseInt(
  process.env.FEES_JOB_INITIAL_DELAY_MS || String(60 * 1000),
  10,
);

async function queryRows(sql, queryParams) {
  const result = await clickhouse.query({
    query: sql,
    query_params: queryParams,
    format: "JSONEachRow",
  });
  return result.json();
}

async function insertDelta(rows) {
  if (!rows.length) return;
  await clickhouse.insert({
    table: "activity_hourly_delta",
    values: rows,
    format: "JSONEachRow",
  });
}

// Wipe every fee row this job has previously written for (tenant, day) so the
// fresh write below is the single source of truth. SummingMergeTree only adds;
// without an explicit clear, re-running the job (or the operator changing a
// fee rate mid-day) double-counts. mutations_sync=2 waits for the ALTER ...
// DELETE to land across replicas before we insert the new rows.
async function clearExistingFees(tenantId, hourBucket) {
  await clickhouse.command({
    query: `
      ALTER TABLE activity_hourly_delta
      DELETE WHERE tenant_id   = {tenantId:String}
              AND hour_bucket = {hourBucket:DateTime}
              AND player_id   = '__fees__'
    `,
    query_params: { tenantId, hourBucket },
    clickhouse_settings: { mutations_sync: 2 },
  });
}

function boundsFor(dayOffset = -1) {
  // dayOffset = -1 → yesterday (default); 0 → today (for manual test).
  const now = new Date();
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + dayOffset),
  );
  return boundsForDate(start);
}

// Bounds for an explicit UTC day. Pass any Date — it's snapped to the
// start of its UTC day, and `start` itself becomes the as-of timestamp
// for the fee resolver.
function boundsForDate(date) {
  const start = new Date(Date.UTC(
    date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(),
  ));
  const end = new Date(Date.UTC(
    start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + 1,
  ));
  const hourBucketStr = start
    .toISOString()
    .replace("T", " ")
    .replace("Z", "")
    .split(".")[0];
  return {
    asOfDate: start,
    fromTs: start.toISOString().replace("T", " ").split(".")[0],
    toTs:   end.toISOString().replace("T", " ").split(".")[0],
    hourBucket: hourBucketStr,
  };
}

const yesterdayBounds = () => boundsFor(-1);

async function runForOperator(operator, operatorFinancials, bounds, { applyCurrentFees = false } = {}) {
  const tenantId = operator._id.toString();

  // Pick the fee snapshot for the date being processed. By default that's
  // the version that was active on `bounds.asOfDate` (frozen-in-time
  // historical recalc — re-runs are idempotent and don't shift past
  // numbers). When the operator deliberately opts in via the manual-run
  // endpoint we fall back to "now" so today's fees retroactively rewrite
  // the row.
  const resolveDate = applyCurrentFees ? new Date() : bounds.asOfDate;

  const providerRates = await resolveProviderRatesAsOf({
    operatorId: operator._id,
    asOfDate: resolveDate,
  });
  const providerRateMap = new Map();
  for (const r of providerRates) {
    const bKey = r.brandId ? r.brandId.toString() : "default";
    providerRateMap.set(`${bKey}:${r.providerId}`, Number(r.feePercent) || 0);
  }
  const resolveProviderPct = (brandId, providerId) => {
    const bKey = brandId || "default";
    return (
      providerRateMap.get(`${bKey}:${providerId}`) ??
      providerRateMap.get(`default:${providerId}`) ??
      0
    );
  };

  // Brand-scoped financial settings come from the same as-of resolver.
  // We can't pre-load every brand in one query under the new schema, so
  // memoize per brand id within the run — most deltas share a handful
  // of brands.
  const financialCache = new Map();
  const resolveFinancials = async (brandId) => {
    const key = brandId || "default";
    if (financialCache.has(key)) return financialCache.get(key);
    const row = await resolveFinancialsAsOf({
      operatorId: operator._id,
      brandId: brandId || null,
      asOfDate: resolveDate,
    });
    const result = row || operatorFinancials;
    financialCache.set(key, result);
    return result;
  };

  // Aggregate yesterday's money movement grouped by attribution dimensions.
  // affiliate_id can be empty (unattributed); we still want those rows so
  // operator-wide fees are accurate even if an affiliate report isn't.
  //
  // deposits_fee_attributed_sum_cents / cashouts_fee_attributed_sum_cents
  // are populated by the raw consumer when an event carries feeCents. We
  // subtract them from the rate-base so event-level fees aren't double-
  // counted by the cron.
  const rows = await queryRows(
    `SELECT
       brand_id     AS brandId,
       affiliate_id AS affiliateId,
       currency,
       provider,
       SUM(bets_sum_cents)                         AS bets,
       SUM(wins_sum_cents)                         AS wins,
       SUM(deposits_sum_cents)                     AS deposits,
       SUM(cashouts_sum_cents)                     AS cashouts,
       SUM(deposits_fee_attributed_sum_cents)      AS depositsFeeAttributed,
       SUM(cashouts_fee_attributed_sum_cents)      AS cashoutsFeeAttributed,
       -- Sportsbook bases for the sb third-party fee computation
       SUM(sb_bets_sum_cents)                      AS sbBets,
       SUM(sb_cancelled_bets_sum_cents)            AS sbCancelled,
       SUM(sb_rejected_bets_sum_cents)             AS sbRejected,
       SUM(sb_wins_sum_cents)                      AS sbWins,
       SUM(sb_win_rollbacks_sum_cents)             AS sbWinRollbacks,
       -- Existing operator-published additional deductions for this bucket.
       -- Used to decide whether the cron should apply its own custom percents
       -- (only when alwaysDeductCustomFees is on or this value is zero).
       SUM(additional_deductions_sum_cents)        AS existingAdditionalDeductions
     FROM affiliate.activity_hourly_delta
     WHERE tenant_id = {tenantId:String}
       AND hour_bucket >= {fromTs:DateTime}
       AND hour_bucket <  {toTs:DateTime}
     GROUP BY brand_id, affiliate_id, currency, provider
     HAVING bets + deposits + cashouts + sbBets > 0`,
    { tenantId, fromTs: bounds.fromTs, toTs: bounds.toTs },
  );

  const deltaRows = [];
  for (const r of rows) {
    const brandFinancials = await resolveFinancials(r.brandId);
    const { gameProviderFees, depositFees, withdrawalFees, jackpotFees, casinoTaxes } =
      computeFeesForBucket(
        {
          bets: r.bets,
          wins: r.wins,
          deposits: r.deposits,
          cashouts: r.cashouts,
          depositsFeeAttributed: r.depositsFeeAttributed,
          cashoutsFeeAttributed: r.cashoutsFeeAttributed,
        },
        {
          // depositFeePercent gained its own column in the model; read the
          // legacy paymentSystemFeePercent as a fallback for documents that
          // predate the migration.
          depositFeePercent:
            brandFinancials.depositFeePercent ??
            brandFinancials.paymentSystemFeePercent,
          withdrawalFeePercent: brandFinancials.withdrawalFeePercent,
          jackpotFeePercent:    brandFinancials.jackpotFeePercent,
          casinoTaxPercent:     brandFinancials.casinoTaxPercent,
          providerFeePercent:   resolveProviderPct(r.brandId, r.provider),
        },
      );

    // Sportsbook third-party fees (bookmaker / data-feed costs) — mirrors
    // the casino game-provider-fees pattern but applied to sb_ggr.
    const sbBets          = Number(r.sbBets)          || 0;
    const sbCancelled     = Number(r.sbCancelled)     || 0;
    const sbRejected      = Number(r.sbRejected)      || 0;
    const sbWins          = Number(r.sbWins)          || 0;
    const sbWinRollbacks  = Number(r.sbWinRollbacks)  || 0;
    const sbGgr = Math.max(
      0,
      sbBets - sbCancelled - sbRejected - (sbWins - sbWinRollbacks),
    );
    const sbThirdPartyPct = Number(brandFinancials.sbThirdPartyFeePercent) || 0;
    const sbThirdPartyFees = Math.round((sbGgr * sbThirdPartyPct) / 100);

    // Operator-defined custom deductions, mirrors the operator-wide pattern
    // but rolled into additional_deductions_sum_cents so they reduce NGR
    // through the existing formula instead of inflating a specific bucket.
    //   custom NGR fee     — % of combined GGR (casino + sb)
    //   custom deposit fee — % of deposits, respecting fee-attribution carve-
    //                        out so events with their own feeCents aren't
    //                        double-charged
    const casinoGgr = Math.max(0, Number(r.bets || 0) - Number(r.wins || 0));
    const customNgrPct = Number(brandFinancials.customNgrFeePercent) || 0;
    const customDepPct = Number(brandFinancials.customDepositFeePercent) || 0;
    const depositRateBase = Math.max(
      0,
      Number(r.deposits || 0) - Number(r.depositsFeeAttributed || 0),
    );
    // If the operator already published additional_deductions_sum_cents for
    // this bucket, defer to that value unless alwaysDeductCustomFees is on.
    const opPublishedAdditional =
      Number(r.existingAdditionalDeductions || 0) > 0;
    const applyCustomFees =
      !!brandFinancials.alwaysDeductCustomFees || !opPublishedAdditional;
    const customNgrFeesCents = applyCustomFees
      ? Math.round(((casinoGgr + sbGgr) * customNgrPct) / 100)
      : 0;
    const customDepositFeesCents = applyCustomFees
      ? Math.round((depositRateBase * customDepPct) / 100)
      : 0;
    const customFeesCents = customNgrFeesCents + customDepositFeesCents;

    if (
      !gameProviderFees &&
      !depositFees &&
      !withdrawalFees &&
      !jackpotFees &&
      !casinoTaxes &&
      !sbThirdPartyFees &&
      !customFeesCents
    ) {
      continue;
    }

    deltaRows.push({
      tenant_id: tenantId,
      brand_id: r.brandId || "",
      // Fees aren't tied to a player; use a marker so the delta row doesn't
      // collide with real player aggregations.
      player_id: "__fees__",
      currency: r.currency || "",
      country: "",
      hour_bucket: bounds.hourBucket,
      affiliate_id: r.affiliateId || "",
      affiliate_code: "",
      campaign: "",
      sub_id: "",
      provider: r.provider || "",
      source_system: "affiliate-be",
      source_event_id: `fees-${tenantId}-${r.brandId}-${r.affiliateId}-${r.provider}-${bounds.hourBucket}`,
      deposit_fees_sum_cents: depositFees,
      withdrawal_fees_sum_cents: withdrawalFees,
      jackpot_fees_sum_cents: jackpotFees,
      game_provider_fees_sum_cents: gameProviderFees,
      casino_taxes_sum_cents: casinoTaxes,
      sb_third_party_fees_sum_cents: sbThirdPartyFees,
      additional_deductions_sum_cents: customFeesCents,
    });
  }

  await clearExistingFees(tenantId, bounds.hourBucket);
  await insertDelta(deltaRows);
  logger.info("fees.job.operator.ok", {
    operatorId: tenantId,
    rows: deltaRows.length,
    fromTs: bounds.fromTs,
  });
}

async function runOnce({
  dayOffset = -1,
  forDate = null,
  applyCurrentFees = false,
} = {}) {
  // forDate (explicit Date) wins over dayOffset (relative to now). The
  // manual-run endpoint uses forDate for date-range loops; the nightly
  // cron + legacy callers keep using dayOffset.
  const bounds = forDate ? boundsForDate(forDate) : boundsFor(dayOffset);

  // The fallback used when no version row exists for a given (operator,
  // brand, day) pair. Use the as-of resolver so the fallback also respects
  // historical fees when we're recomputing past dates.
  const resolveDate = applyCurrentFees ? new Date() : bounds.asOfDate;

  const operators = await Operator.find({ isDeleted: false })
    .select({ _id: 1 })
    .lean();
  let processed = 0;
  for (const op of operators) {
    try {
      const financials =
        (await resolveFinancialsAsOf({
          operatorId: op._id,
          brandId: null,
          asOfDate: resolveDate,
        })) || {
          depositFeePercent: 0,
          withdrawalFeePercent: 0,
          jackpotFeePercent: 0,
          casinoTaxPercent: 0,
        };
      await runForOperator(op, financials, bounds, { applyCurrentFees });
      processed++;
    } catch (err) {
      logger.error("fees.job.operator.failed", {
        operatorId: op._id?.toString(),
        error: err?.message || String(err),
      });
    }
  }
  logger.info("fees.job.ok", { operators: processed, fromTs: bounds.fromTs });
}

function startFeesDailyJob() {
  setTimeout(() => {
    runOnce().catch((err) =>
      logger.error("fees.job.initial_failed", {
        error: err?.message || String(err),
      }),
    );
    const timer = setInterval(() => {
      runOnce().catch((err) =>
        logger.error("fees.job.interval_failed", {
          error: err?.message || String(err),
        }),
      );
    }, REFRESH_MS);
    timer.unref?.();
  }, INITIAL_DELAY_MS);
  logger.info("fees.job.started", { refreshMs: REFRESH_MS });
}

module.exports = { startFeesDailyJob, runOnce };
