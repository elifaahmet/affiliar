const clickhouse = require("../config/clickhouse");
const Operator = require("../models/Operator");
const OperatorFinancialSettings = require("../models/OperatorFinancialSettings");
const ProviderFeeRate = require("../models/ProviderFeeRate");
const { logger } = require("../middlewares/logger");

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

function yesterdayBounds() {
  const now = new Date();
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1),
  );
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
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

async function runForOperator(operator, financials, bounds) {
  const tenantId = operator._id.toString();

  const providerRates = await ProviderFeeRate.find({
    operatorId: operator._id,
    isDeleted: false,
  }).lean();
  const providerRateMap = new Map(
    providerRates.map((r) => [r.providerId, Number(r.feePercent) || 0]),
  );

  // Aggregate yesterday's money movement grouped by attribution dimensions.
  // affiliate_id can be empty (unattributed); we still want those rows so
  // operator-wide fees are accurate even if an affiliate report isn't.
  const rows = await queryRows(
    `SELECT
       brand_id     AS brandId,
       affiliate_id AS affiliateId,
       currency,
       provider,
       SUM(bets_sum_cents)      AS bets,
       SUM(wins_sum_cents)      AS wins,
       SUM(deposits_sum_cents)  AS deposits
     FROM affiliate.activity_hourly_delta
     WHERE tenant_id = {tenantId:String}
       AND hour_bucket >= {fromTs:DateTime}
       AND hour_bucket <  {toTs:DateTime}
     GROUP BY brand_id, affiliate_id, currency, provider
     HAVING bets + deposits > 0`,
    { tenantId, fromTs: bounds.fromTs, toTs: bounds.toTs },
  );

  const paymentPct = Number(financials.paymentSystemFeePercent) || 0;
  const jackpotPct = Number(financials.jackpotFeePercent) || 0;
  const taxPct = Number(financials.casinoTaxPercent) || 0;

  const deltaRows = [];
  for (const r of rows) {
    const bets = Number(r.bets) || 0;
    const wins = Number(r.wins) || 0;
    const deposits = Number(r.deposits) || 0;
    const providerGgr = Math.max(0, bets - wins);

    const providerPct = providerRateMap.get(r.provider) || 0;
    const gameProviderFees = Math.round((providerGgr * providerPct) / 100);
    const paymentSystemFees = Math.round((deposits * paymentPct) / 100);
    const jackpotFees = Math.round((bets * jackpotPct) / 100);
    const casinoTaxes = Math.round((providerGgr * taxPct) / 100);

    if (
      !gameProviderFees &&
      !paymentSystemFees &&
      !jackpotFees &&
      !casinoTaxes
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
      payment_system_fees_sum_cents: paymentSystemFees,
      jackpot_fees_sum_cents: jackpotFees,
      game_provider_fees_sum_cents: gameProviderFees,
      casino_taxes_sum_cents: casinoTaxes,
    });
  }

  await insertDelta(deltaRows);
  logger.info("fees.job.operator.ok", {
    operatorId: tenantId,
    rows: deltaRows.length,
    fromTs: bounds.fromTs,
  });
}

async function runOnce() {
  const bounds = yesterdayBounds();
  const operators = await Operator.find({ isDeleted: false })
    .select({ _id: 1 })
    .lean();
  let processed = 0;
  for (const op of operators) {
    try {
      // Settings may be absent entirely — that's a valid state. Default
      // everything to 0% so only provider-level rates (if any) apply. The
      // per-row "all fees zero" check below still skips writing noise rows.
      const financials =
        (await OperatorFinancialSettings.findOne({
          operatorId: op._id,
        }).lean()) || {
          paymentSystemFeePercent: 0,
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
