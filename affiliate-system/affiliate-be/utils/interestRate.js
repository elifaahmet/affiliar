"use strict";

// The daily rate charged on an overdue invoice.
//
// Built from a real benchmark rather than a number someone picked: SOFR is the
// US overnight funding rate the Fed publishes each business day, and it is what
// USD commercial contracts reference. On top of it sits a margin, because the
// benchmark alone only covers the cost of money — it doesn't compensate for a
// customer choosing not to pay.
//
//   daily % = (SOFR annual % + margin annual %) / 365
//
// Dividing by 365 is the part that matters. SOFR is quoted annually; using
// 3.63 as a *daily* rate would charge 3.63% a day — over 1300% a year — and
// the mistake would look like a plausible number on the invoice.

const { logger } = require("../middlewares/logger");

const SOFR_URL = "https://markets.newyorkfed.org/api/rates/secured/sofr/last/1.json";

// Late-payment margin over the benchmark. 8% is the middle of ordinary
// commercial terms (typically benchmark + 6–10%).
const MARGIN_PERCENT = parseFloat(
  process.env.BILLING_INTEREST_MARGIN_PERCENT || "8",
);

// Used when the benchmark can't be fetched and nothing is cached yet. Set to
// the benchmark's rough level rather than 0: charging nothing on every overdue
// invoice because a rates API was briefly down is the wrong failure.
const FALLBACK_BENCHMARK_PERCENT = parseFloat(
  process.env.BILLING_INTEREST_FALLBACK_PERCENT || "4",
);

// A fixed daily rate, if an operator would rather not track a benchmark at
// all. Overrides everything above when set.
const FIXED_DAILY_PERCENT = process.env.BILLING_DAILY_INTEREST_PERCENT
  ? parseFloat(process.env.BILLING_DAILY_INTEREST_PERCENT)
  : null;

const REFRESH_MS = parseInt(
  process.env.BILLING_INTEREST_REFRESH_MS || String(12 * 60 * 60 * 1000),
  10,
);

let cached = null; // { annualPercent, effectiveDate, fetchedAt }
let timer = null;

async function fetchBenchmark() {
  const res = await fetch(SOFR_URL, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`SOFR HTTP ${res.status}`);
  const body = await res.json();
  const row = (body.refRates || [])[0];
  const rate = Number(row?.percentRate);
  if (!isFinite(rate) || rate < 0 || rate > 25) {
    // A benchmark outside this band means the response shape changed or the
    // feed is wrong; either way it must not reach an invoice.
    throw new Error(`SOFR out of range: ${row?.percentRate}`);
  }
  return { annualPercent: rate, effectiveDate: row.effectiveDate, fetchedAt: new Date() };
}

async function refresh() {
  try {
    cached = await fetchBenchmark();
    logger.info("billing.interest.benchmark.ok", {
      sofrPercent: cached.annualPercent,
      effectiveDate: cached.effectiveDate,
      dailyPercent: dailyPercent(),
    });
  } catch (err) {
    // Keep whatever we had. Only the first failure of a cold start leaves us
    // on the fallback, and that is logged loudly enough to notice.
    logger.warn("billing.interest.benchmark.failed", {
      error: err?.message,
      usingCached: !!cached,
      fallbackPercent: cached ? null : FALLBACK_BENCHMARK_PERCENT,
    });
  }
}

// Current daily interest rate, as a percentage.
function dailyPercent() {
  if (FIXED_DAILY_PERCENT !== null) return FIXED_DAILY_PERCENT;
  const benchmark = cached ? cached.annualPercent : FALLBACK_BENCHMARK_PERCENT;
  return (benchmark + MARGIN_PERCENT) / 365;
}

// What the rate is made of, for the email and for anyone auditing a charge.
function describe() {
  if (FIXED_DAILY_PERCENT !== null) {
    return { dailyPercent: FIXED_DAILY_PERCENT, source: "fixed", benchmarkPercent: null, marginPercent: null, effectiveDate: null };
  }
  return {
    dailyPercent: dailyPercent(),
    source: cached ? "SOFR" : "fallback",
    benchmarkPercent: cached ? cached.annualPercent : FALLBACK_BENCHMARK_PERCENT,
    marginPercent: MARGIN_PERCENT,
    effectiveDate: cached ? cached.effectiveDate : null,
  };
}

function startInterestRateJob() {
  refresh();
  if (!timer) timer = setInterval(refresh, REFRESH_MS);
}

function stopInterestRateJob() {
  if (timer) { clearInterval(timer); timer = null; }
}

module.exports = { dailyPercent, describe, refresh, startInterestRateJob, stopInterestRateJob };
