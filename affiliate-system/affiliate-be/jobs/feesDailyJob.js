const clickhouse = require("../config/clickhouse");
const Operator = require("../models/Operator");
const OperatorFinancialSettings = require("../models/OperatorFinancialSettings");
const ProviderFeeRate = require("../models/ProviderFeeRate");
const { logger } = require("../middlewares/logger");
const { computeFeesForBucket, computeCustomFeesForBucket } = require("./computeFees");

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
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + dayOffset + 1),
  );
  const hourBucketStr = start
    .toISOString()
    .replace("T", " ")
    .replace("Z", "")
    .split(".")[0];
  return {
    fromTs: start.toISOString().replace("T", " ").split(".")[0],
    toTs: end.toISOString().replace("T", " ").split(".")[0],
    hourBucket: hourBucketStr,
  };
}

const yesterdayBounds = () => boundsFor(-1);

async function runForOperator(operator, operatorFinancials, bounds) {
  const tenantId = operator._id.toString();

  // Pull all provider rates for this operator in one query; index by
  // (brandId|default, providerId) so per-brand lookup + operator-wide
  // fallback is O(1).
  const providerRates = await ProviderFeeRate.find({
    operatorId: operator._id,
    isDeleted: false,
  }).lean();
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

  // Same fan-out for financial settings: brand-specific trumps operator-wide.
  const allFinancials = await OperatorFinancialSettings.find({
    operatorId: operator._id,
  }).lean();
  const financialMap = new Map();
  for (const f of allFinancials) {
    financialMap.set(f.brandId ? f.brandId.toString() : "default", f);
  }
  const resolveFinancials = (brandId) =>
    financialMap.get(brandId || "default") ||
    financialMap.get("default") ||
    operatorFinancials;

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
       SUM(sb_win_rollbacks_sum_cents)             AS sbWinRollbacks
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
    const brandFinancials = resolveFinancials(r.brandId);
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

    // Operator-defined custom deductions (license levies, platform fees, …).
    // Applied to combined GGR and rolled into additional_deductions_sum_cents
    // so they flow through the existing NGR formula.
    const casinoGgr = Math.max(0, Number(r.bets || 0) - Number(r.wins || 0));
    const customFeesCents = computeCustomFeesForBucket(
      casinoGgr + sbGgr,
      brandFinancials.customFees,
    );

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

async function runOnce({ dayOffset = -1 } = {}) {
  const bounds = boundsFor(dayOffset);
  const operators = await Operator.find({ isDeleted: false })
    .select({ _id: 1 })
    .lean();
  let processed = 0;
  for (const op of operators) {
    try {
      // Pass the operator-wide (brandId: null) default as the hard fallback.
      // runForOperator pulls all brand-scoped rows itself and resolves the
      // right one per delta row.
      const financials =
        (await OperatorFinancialSettings.findOne({
          operatorId: op._id,
          brandId: null,
        }).lean()) || {
          depositFeePercent: 0,
          withdrawalFeePercent: 0,
          jackpotFeePercent: 0,
          casinoTaxPercent: 0,
        };
      await runForOperator(op, financials, bounds);
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
