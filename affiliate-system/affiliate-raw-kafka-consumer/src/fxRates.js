import { config } from './config.js';

// Cached rates: { "EUR": 1.1709, "USD": 1.0, ... } — each value is "1 unit of
// that currency in baseCurrency". Rates are sourced from hexora-db.exchangeRates
// which uses the FROM_TO code format (e.g. "EUR_USD" for EUR→USD).

const BASE_CURRENCY = (config.fx?.baseCurrency || 'USD').toUpperCase();

let ratesCol;
let rates = new Map(); // currency → rate to base
let refreshTimer;

export async function connectFxRates(db) {
  ratesCol = db.collection('exchangeRates');
  await refreshRates();
  const refreshMs = config.fx?.refreshMs ?? 5 * 60 * 1000;
  refreshTimer = setInterval(() => {
    refreshRates().catch((err) =>
      console.error('[fx] Refresh failed:', err.message),
    );
  }, refreshMs);
  console.log(
    `[fx] Loaded ${rates.size} rates to ${BASE_CURRENCY}; refresh every ${refreshMs}ms`,
  );
}

export function closeFxRates() {
  if (refreshTimer) clearInterval(refreshTimer);
}

async function refreshRates() {
  const cursor = ratesCol.find(
    { exchange_rate_code: { $regex: `_${BASE_CURRENCY}$` } },
    { projection: { exchange_rate_code: 1, value: 1 } },
  );
  const next = new Map();
  next.set(BASE_CURRENCY, 1);
  for await (const doc of cursor) {
    const code = String(doc.exchange_rate_code || '');
    const match = code.match(/^([A-Z]+)_[A-Z]+$/);
    if (!match) continue;
    const from = match[1];
    const value = decimalToNumber(doc.value);
    if (value > 0) next.set(from, value);
  }
  rates = next;
}

function decimalToNumber(v) {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'object') {
    // Mongo Decimal128 comes back via JSON as { $numberDecimal: "..." } or
    // as an object with .toString() in raw driver
    if (v.$numberDecimal) return parseFloat(v.$numberDecimal);
    if (typeof v.toString === 'function') return parseFloat(v.toString());
  }
  return parseFloat(String(v)) || 0;
}

/**
 * Convert an integer cents value from `from` currency to base currency cents.
 * Returns the original value when conversion isn't possible (unknown currency,
 * rates not loaded yet) so delta rows stay writable.
 */
export function toBaseCents(cents, from) {
  if (!cents) return cents || 0;
  if (!from) return cents;
  const code = from.toUpperCase();
  if (code === BASE_CURRENCY) return cents;
  const rate = rates.get(code);
  if (!rate) return cents;
  return Math.round(cents * rate);
}

export function baseCurrency() {
  return BASE_CURRENCY;
}
