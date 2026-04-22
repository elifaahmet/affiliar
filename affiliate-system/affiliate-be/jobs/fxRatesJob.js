const mongoose = require("mongoose");
const { logger } = require("../middlewares/logger");

// Supported currencies for the raw-event FX normalization. Add more by
// setting FX_SUPPORTED_CURRENCIES env (comma-separated, e.g. "USD,EUR,TRY").
// All of these are fetched against FX_BASE_CURRENCY and stored as
// {code}_{BASE} rows in exchangeRates.
const DEFAULT_SUPPORTED = ["USD", "EUR", "TRY", "GBP", "INR", "JPY"];
const BASE_CURRENCY = (process.env.FX_BASE_CURRENCY || "USD").toUpperCase();
const SUPPORTED = (process.env.FX_SUPPORTED_CURRENCIES || DEFAULT_SUPPORTED.join(","))
  .split(",")
  .map((s) => s.trim().toUpperCase())
  .filter(Boolean);

const FRANKFURTER_URL = "https://api.frankfurter.app/latest";
// Refresh once per day by default (frankfurter updates daily from ECB).
const REFRESH_MS = parseInt(
  process.env.FX_JOB_REFRESH_MS || String(24 * 60 * 60 * 1000),
  10,
);

async function fetchRates() {
  // ?from=BASE returns rates[X] = amount of X for 1 BASE.
  // We invert to get X→BASE (rate applied to an amount in X to convert to BASE).
  const url = `${FRANKFURTER_URL}?from=${BASE_CURRENCY}&to=${SUPPORTED.filter(
    (c) => c !== BASE_CURRENCY,
  ).join(",")}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`frankfurter ${res.status}: ${await res.text()}`);
  }
  const body = await res.json();
  const baseToX = body?.rates || {};
  const rates = [];
  for (const [code, baseToRate] of Object.entries(baseToX)) {
    if (!baseToRate || baseToRate <= 0) continue;
    // X_BASE = 1 / (BASE_X)
    rates.push({ code: `${code}_${BASE_CURRENCY}`, value: 1 / baseToRate });
  }
  // Self-rate for the base currency.
  rates.push({ code: `${BASE_CURRENCY}_${BASE_CURRENCY}`, value: 1 });
  return rates;
}

async function upsertRates(rates) {
  const col = mongoose.connection.db.collection("exchangeRates");
  const now = new Date();
  const ops = rates.map((r) => ({
    updateOne: {
      filter: { exchange_rate_code: r.code },
      update: {
        $set: {
          exchange_rate_code: r.code,
          // Mongo driver will store a double here; consumer's decimalToNumber
          // handles both double and Decimal128.
          value: r.value,
          exchange_rate_date: now,
        },
      },
      upsert: true,
    },
  }));
  if (!ops.length) return 0;
  const res = await col.bulkWrite(ops, { ordered: false });
  return res.upsertedCount + res.modifiedCount;
}

async function runOnce() {
  try {
    const rates = await fetchRates();
    const written = await upsertRates(rates);
    logger.info("fx.job.ok", { base: BASE_CURRENCY, count: rates.length, written });
  } catch (err) {
    logger.error("fx.job.failed", { error: err?.message || String(err) });
  }
}

function startFxRatesJob() {
  // Fire immediately so the collection has fresh data on boot.
  runOnce();
  const timer = setInterval(runOnce, REFRESH_MS);
  timer.unref?.();
  logger.info("fx.job.started", {
    base: BASE_CURRENCY,
    supported: SUPPORTED,
    refreshMs: REFRESH_MS,
  });
  return timer;
}

module.exports = { startFxRatesJob, runOnce };
