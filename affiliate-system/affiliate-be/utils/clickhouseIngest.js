const { createClient } = require("@clickhouse/client");
const Currency = require("../models/Currency");
const redisClient = require("../redis/redisClient");
const { logMsg } = require("../middlewares/logger");
const { MSG } = require("../middlewares/log-messages");

const TABLE_NAME =
  process.env.MONEY_TRANSFERS_CLICKHOUSE_TABLE || "money_transfer";
const MAIN_CURRENCY = (process.env.APP_MAIN_CURRENCY || "").toUpperCase();

let clickhouseClient = null;

function getClickhouseClient() {
  if (clickhouseClient) return clickhouseClient;

  const endpoint = process.env.CLICKHOUSE_ENDPOINT || "";
  const database = process.env.CLICKHOUSE_DATABASE || "pixup";
  const username = process.env.CLICKHOUSE_USER || "default";
  const password = process.env.CLICKHOUSE_PASSWORD || "";

  if (!endpoint) {
    logMsg(MSG.CLICKHOUSE_DISABLED, { reason: "missing_endpoint" }, "warn");
    return null;
  }

  let url = endpoint.startsWith("http") ? endpoint : `http://${endpoint}`;
  url = url.replace(/:9001/, ":8123").replace(/:9000/, ":8123");

  clickhouseClient = createClient({
    url,
    database,
    username,
    password,
  });

  return clickhouseClient;
}

function normalizeDecimal(value) {
  if (value === null || value === undefined) return "0";
  if (typeof value === "object" && value.$numberDecimal) {
    return value.$numberDecimal;
  }
  if (typeof value === "object" && typeof value.toString === "function") {
    return value.toString();
  }
  return String(value);
}

function normalizeId(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "object" && typeof value.toString === "function") {
    return value.toString();
  }
  return String(value);
}

async function resolveCurrencyCode(transaction) {
  const directCode =
    transaction?.currencyData?.code || transaction?.currency?.code || null;
  if (directCode) return String(directCode).toUpperCase();

  const currencyId = transaction?.currency;
  if (!currencyId) return null;

  const currencyKey = `currency:${normalizeId(currencyId)}`;
  const cachedCode = await redisClient.get(currencyKey);
  if (cachedCode) return String(cachedCode).toUpperCase();

  const currencyDoc = await Currency.findById(currencyId, { code: 1 }).lean();

  if (!currencyDoc?.code) return null;

  await redisClient.set(currencyKey, currencyDoc.code, "EX", 3600);
  return String(currencyDoc.code).toUpperCase();
}

async function resolveExchangeRate(fromCurrency, toCurrency) {
  if (!fromCurrency || !toCurrency) return null;
  if (fromCurrency === toCurrency) return 1;

  const key = `exchange_rates|${fromCurrency}_${toCurrency}`;
  const rateStr = await redisClient.get(key);
  if (!rateStr) return null;

  let rateNum;
  try {
    const parsed = JSON.parse(rateStr);
    rateNum = Number(parsed.value || parsed);
  } catch {
    rateNum = Number(rateStr);
  }

  if (!Number.isFinite(rateNum)) return null;
  return rateNum;
}

async function ingestToClickhouse({ transaction, transferType, amount }) {
  try {
    const client = getClickhouseClient();
    if (!client) return false;

    if (!MAIN_CURRENCY) {
      logMsg(
        MSG.CLICKHOUSE_INGEST_ERR,
        { reason: "missing_main_currency" },
        "warn"
      );
      return false;
    }

    const currency = await resolveCurrencyCode(transaction);
    if (!currency) {
      logMsg(
        MSG.CLICKHOUSE_INGEST_ERR,
        { reason: "currency_not_resolved" },
        "warn"
      );
      return false;
    }

    const rate =
      currency === MAIN_CURRENCY
        ? 1
        : await resolveExchangeRate(currency, MAIN_CURRENCY);
    if (!rate) {
      logMsg(
        MSG.CLICKHOUSE_INGEST_ERR,
        {
          reason: "exchange_rate_missing",
          currency,
          mainCurrency: MAIN_CURRENCY,
        },
        "warn"
      );
      return false;
    }

    const amountStr = normalizeDecimal(amount ?? transaction?.amount);
    const amountNum = Number(amountStr);
    if (!Number.isFinite(amountNum)) {
      logMsg(
        MSG.CLICKHOUSE_INGEST_ERR,
        { reason: "invalid_amount", amount: amountStr },
        "warn"
      );
      return false;
    }

    const mainAmountNum = amountNum * rate;

    const now = new Date();
    const clickhouseTimestamp = now
      .toISOString()
      .replace("T", " ")
      .replace("Z", "");

    const isCorrection = transaction?.method === "correction";
    const transferMethod = isCorrection
      ? "Admin/correction"
      : transaction?.provider || transaction?.method || "unknown";

    const payload = {
      timestamp: clickhouseTimestamp,
      player_id: normalizeId(transaction?.playerId) || "",
      wallet_id: normalizeId(transaction?.walletId) || "",
      currency,
      transfer_type:
        transferType === "withdrawal" || transferType === "withdraw"
          ? "withdraw"
          : "deposit",
      transfer_method: transferMethod,
      amount: amountStr,
      mainc_amount: String(mainAmountNum),
    };

    const database = process.env.CLICKHOUSE_DATABASE || "pixup";

    await client.insert({
      table: `${database}.${TABLE_NAME}`,
      values: [payload],
      format: "JSONEachRow",
    });

    logMsg(MSG.CLICKHOUSE_INGEST_OK, {
      table: TABLE_NAME,
      transfer_type: payload.transfer_type,
      amount: payload.amount,
      mainc_amount: payload.mainc_amount,
      player_id: payload.player_id,
      wallet_id: payload.wallet_id,
    });

    return true;
  } catch (error) {
    logMsg(
      MSG.CLICKHOUSE_INGEST_ERR,
      {
        error_message: error?.message || String(error),
        error_stack: error?.stack,
      },
      "error"
    );
    return false;
  }
}

module.exports = { ingestToClickhouse };
