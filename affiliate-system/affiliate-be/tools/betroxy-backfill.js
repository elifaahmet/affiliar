"use strict";

// Betroxy history, from their Mongo into our Kafka.
//
//   1 Sep 2026: written, not yet runnable — the mapping in mapDocument() is
//   deliberately unimplemented until their collections have been inspected.
//   See tools/betroxy-inspect.mongosh.js.
//
// Produces to the same topic live traffic uses, so the backfill and the feed
// are the same path. Writing rows into ClickHouse directly would be quicker and
// would prove nothing: the interesting question is whether the consumer accepts
// these events, resolves the affiliate and computes the same numbers it will
// compute tomorrow, and only the real path answers it.
//
// Where it runs: the machine with both connections. Betroxy's Mongo is on their
// private network and our Kafka listens on localhost, so:
//
//   ssh -N -L 9092:localhost:9092 root@<affiliar-host> &   # our Kafka
//   # Betroxy VPN up
//   BETROXY_MONGODB_URI="mongodb://10.20.0.4:27017,…/betroxy-db?replicaSet=rsData" \
//   KAFKA_BROKERS=localhost:9092 \
//     node tools/betroxy-backfill.js --since 2026-07-01 --dry-run
//
// Dry run is the default. --commit is required to produce.

const path = require("path");
const mongoose = require("mongoose");
const { Kafka, logLevel } = // kafkajs lives in the consumer, not here: this tool produces to the same
// topic that service reads, and installing a second copy of the client to do
// it would be two versions of the wire protocol in one repo.
require(path.join(__dirname, "../../affiliate-raw-kafka-consumer/node_modules/kafkajs"));
const crypto = require("crypto");

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const COMMIT = process.argv.includes("--commit");
// Only for a re-run after the tenant's rows have actually been deleted.
const FORCE = process.argv.includes("--force");
// Every player, not just those who signed up inside the window. Only correct
// for a first-ever import into an empty tenant.
const ALL_REGISTRATIONS = process.argv.includes("--all-registrations");
const SINCE = new Date(arg("since", "2026-07-01T00:00:00Z"));
const URI = process.env.BETROXY_MONGODB_URI;
const BROKERS = (process.env.KAFKA_BROKERS || "localhost:9092").split(",");

// Betroxy's operator record in Affiliar. The consumer maps topic -> tenantId
// from KAFKA_TENANTS, and the envelope carries it too; they have to agree.
const TENANT_ID = process.env.BETROXY_TENANT_ID || "6a875bdfba4f0a45d0db778c";
const BRAND_ID = process.env.BETROXY_BRAND_ID || "default";
const TOPIC = "affiliate.raw.events.betroxy.v1";

/**
 * An event's id is derived from the source document, not generated.
 *
 * This does NOT make the backfill idempotent, and I claimed it did. Nothing
 * downstream deduplicates on it: raw_events is a plain MergeTree, and
 * activity_hourly_delta is a SummingMergeTree — it adds. A second run does not
 * replace the first, it doubles every deposit, bet and win, silently and with
 * no error anywhere.
 *
 * The id is still worth deriving: it makes a row traceable back to the exact
 * source document, which is what you need when a number looks wrong. But the
 * thing that makes a re-run safe is the guard below, not the id.
 */
const eventId = (collection, docId, type) =>
  crypto.createHash("sha1").update(`betroxy:${collection}:${docId}:${type}`).digest("hex");

/**
 * Whether a deposit is the player's first, decided across ALL of time.
 *
 * Not within the backfill window. A player who deposited in June and again in
 * July has a July deposit that is not an FTD, and reading only from 1 July
 * marks it as one. FTD drives commission, so that is not a display error — it
 * pays somebody for an acquisition that already happened.
 *
 * Answered once per player up front rather than per document: on two months of
 * transactions the per-document query is the whole runtime.
 */
async function firstDepositByPlayer(db, collection, playerField, dateField) {
  const rows = await db
    .collection(collection)
    .aggregate([
      // Successful deposits only. Their table is mostly failures — 11,500 of
      // them against 6,253 successes since July — and a failed attempt is not
      // a deposit. Taking the minimum across everything means a player who
      // tried and failed in June and then succeeded in July has their real
      // first deposit dated to the failure, so it is never marked FTD and the
      // acquisition is never paid for.
      { $match: { $expr: { $eq: [{ $toLower: { $trim: { input: "$status" } } }, "success"] } } },
      { $group: { _id: `$${playerField}`, firstAt: { $min: `$${dateField}` } } },
    ])
    .toArray();
  return new Map(rows.map((r) => [String(r._id), r.firstAt]));
}

/**
 * Decimal128 to integer cents.
 *
 * Their amounts are Decimal128 and ours are integer cents. Going through
 * Number() first is the obvious route and the wrong one: it is a float, and a
 * float is exactly what Decimal128 exists to avoid. Converting from the decimal
 * string keeps every digit, and rounding at the end is a stated rounding rather
 * than whatever the binary representation happened to do.
 */
function toCents(dec) {
  if (dec === null || dec === undefined) return 0;
  const [whole, frac = ""] = String(dec).split(".");
  const sign = whole.startsWith("-") ? -1 : 1;
  const w = whole.replace("-", "") || "0";
  const cents = BigInt(w) * 100n + BigInt((frac + "00").slice(0, 2));
  // Third decimal onward decides the rounding, not the float.
  const round = frac.length > 2 && Number(frac[2]) >= 5 ? 1n : 0n;
  return Number((cents + round)) * sign;
}

/**
 * Success, however it was spelled.
 *
 * The deposits carry both "Success" (4,888) and "success" (1,365) since 1 July.
 * Matching the lowercase one takes 1,365 of 6,253 — it drops 78% of the real
 * deposits and looks like a quiet month rather than a bug.
 */
const isSuccess = (status) => String(status || "").trim().toLowerCase() === "success";

/** How many raw events the destination already holds for this tenant inside
 *  the window. Null when ClickHouse cannot be reached, which is different from
 *  zero and has to stay different. */
async function countExistingRows() {
  const host = process.env.CLICKHOUSE_HOST || "http://localhost:8123";
  const sql =
    `SELECT count() FROM ${process.env.CLICKHOUSE_DATABASE || "affiliate"}.raw_events ` +
    `WHERE tenant_id = '${TENANT_ID}' AND occurred_at >= toDateTime('${SINCE.toISOString().slice(0, 19).replace("T", " ")}')`;
  try {
    const res = await fetch(host, {
      method: "POST",
      headers: {
        "X-ClickHouse-User": process.env.CLICKHOUSE_USERNAME || "affiliate",
        "X-ClickHouse-Key": process.env.CLICKHOUSE_PASSWORD || "",
        "Content-Type": "text/plain",
      },
      body: sql,
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    return Number((await res.text()).trim());
  } catch {
    return null;
  }
}

const envelope = ({ id, type, playerId, currency, occurredAt, data }) => ({
  eventId: id,
  eventType: type,
  tenantId: TENANT_ID,
  brandId: BRAND_ID,
  playerId: String(playerId),
  currency: String(currency || "").toUpperCase(),
  occurredAt: new Date(occurredAt).toISOString(),
  source: { system: "betroxy-backfill" },
  data,
});

async function run() {
  if (!URI) {
    console.error("BETROXY_MONGODB_URI is required (needs the Betroxy VPN).");
    process.exit(1);
  }

  await mongoose.connect(URI, {
    serverSelectionTimeoutMS: 8000,
    readPreference: "secondaryPreferred",
  });
  const db = mongoose.connection.db;
  console.log(`source: ${db.databaseName}`);
  console.log(`window: ${SINCE.toISOString().slice(0, 10)} → now`);
  console.log(`target: ${TOPIC} on ${BROKERS.join(",")}`);
  console.log(COMMIT ? "MODE: committing\n" : "MODE: dry run — nothing is produced\n");

  /**
   * Refuse to produce into a window that already has rows.
   *
   * Both destination tables accumulate, so producing over existing data is not
   * a correction — it is a second copy added to the first. Betroxy already
   * carries 2,941 events from a live integration test on 21 August, which sits
   * inside any window starting 1 July.
   *
   * Checked against ClickHouse rather than tracked in a state file: the
   * question is what the destination holds, and only the destination can
   * answer it. --force exists for the case where the rows were deliberately
   * deleted first, and says so out loud.
   */
  if (COMMIT && !FORCE) {
    const existing = await countExistingRows();
    if (existing === null) {
      console.error("Could not reach ClickHouse to check for existing rows. Refusing to");
      console.error("produce blind: both destination tables accumulate, so a second copy");
      console.error("doubles every figure rather than replacing it.");
      process.exit(1);
    }
    if (existing > 0) {
      console.error(`\nRefusing: tenant ${TENANT_ID} already has ${existing} raw events in this window.`);
      console.error("");
      console.error("activity_hourly_delta is a SummingMergeTree — producing over these adds");
      console.error("to them. Deposits, bets and wins would all read double, with nothing");
      console.error("reporting an error.");
      console.error("");
      console.error("To redo the import, delete this tenant's rows first:");
      console.error(`  ALTER TABLE affiliate.raw_events DELETE WHERE tenant_id = '${TENANT_ID}' SETTINGS mutations_sync = 1;`);
      console.error(`  ALTER TABLE affiliate.activity_hourly_delta DELETE WHERE tenant_id = '${TENANT_ID}' SETTINGS mutations_sync = 1;`);
      console.error("then run again. --force skips this check and is for exactly that case.");
      process.exit(1);
    }
  }

  const kafka = new Kafka({ clientId: "betroxy-backfill", brokers: BROKERS, logLevel: logLevel.ERROR });
  const producer = kafka.producer({ idempotent: true });
  if (COMMIT) await producer.connect();

  // Currency is stored two ways in the same database: deposits and withdrawals
  // reference the currencies collection by ObjectId, casino and sportsbook
  // rows carry the code as a string. One fact, two representations — resolved
  // here so the rest of the mapping only ever sees a code.
  const currencyById = new Map(
    (await db.collection("currencies").find({}).toArray()).map((c) => [String(c._id), c.code])
  );

  // FTD across all of time, not across the window — see firstDepositByPlayer.
  const firstDeposit = await firstDepositByPlayer(db, "deposittransactions", "playerId", "createdAt");
  console.log(`first-deposit index: ${firstDeposit.size} players\n`);

  const counts = {};
  const bump = (k, n = 1) => { counts[k] = (counts[k] || 0) + n; };
  let batch = [];

  const emit = async (ev) => {
    bump(ev.eventType);
    if (!COMMIT) return;
    batch.push({ key: ev.playerId, value: JSON.stringify(ev) });
    if (batch.length >= 500) {
      await producer.send({ topic: TOPIC, messages: batch });
      batch = [];
    }
  };

  // ── registrations ────────────────────────────────────────────────────────
  //
  // Scoped to the window by default, and that default matters more than it
  // looks. The first import emitted one for EVERY player whatever their signup
  // date — correct then, because a player who registered in May but bet in July
  // still needs a row or their activity arrives for somebody the consumer has
  // never heard of.
  //
  // On a gap run that same behaviour re-sends all of them. Nothing downstream
  // deduplicates, and activity_hourly_delta sums `registrations`, so a second
  // pass doubles the registration count for the whole brand — a figure that
  // reads as growth and is arithmetic.
  //
  // --all-registrations restores the original behaviour, and is only right for
  // a first-ever import into an empty tenant.
  //
  // No affiliateCode: their database records none. marketingcodes and
  // referralsettings are both empty and players carries no attribution field,
  // so every player here is unattributed and no commission will compute on
  // this history. That is the honest import, not a gap in the mapping.
  const players = db.collection("players");
  const playerFilter = ALL_REGISTRATIONS ? {} : { createdAt: { $gte: SINCE } };
  for await (const p of players.find(playerFilter, { projection: { _id: 1, createdAt: 1 } })) {
    await emit(envelope({
      id: eventId("players", p._id, "player.registered"),
      type: "player.registered",
      playerId: p._id,
      currency: "INR",
      occurredAt: p.createdAt || SINCE,
      data: {},
    }));
  }

  // ── deposits ─────────────────────────────────────────────────────────────
  const deposits = db.collection("deposittransactions");
  for await (const d of deposits.find({ createdAt: { $gte: SINCE } })) {
    if (!isSuccess(d.status)) { bump("skipped:deposit_not_success"); continue; }
    const first = firstDeposit.get(String(d.playerId));
    await emit(envelope({
      id: eventId("deposittransactions", d._id, "wallet.deposit.confirmed"),
      type: "wallet.deposit.confirmed",
      playerId: d.playerId,
      currency: currencyById.get(String(d.currency)) || "INR",
      occurredAt: d.createdAt,
      data: {
        amountCents: toCents(d.amount),
        paymentMethod: d.method || undefined,
        // True only when this IS the earliest deposit the player ever made.
        isFirstDeposit: !!first && first.getTime() === new Date(d.createdAt).getTime(),
      },
    }));
    if (first && first.getTime() === new Date(d.createdAt).getTime()) bump("of which FTD");
  }

  // ── withdrawals ──────────────────────────────────────────────────────────
  const withdrawals = db.collection("withdrawaltransactions");
  for await (const w of withdrawals.find({ createdAt: { $gte: SINCE } })) {
    if (!isSuccess(w.status)) { bump("skipped:withdrawal_not_success"); continue; }
    await emit(envelope({
      id: eventId("withdrawaltransactions", w._id, "wallet.withdrawal.completed"),
      type: "wallet.withdrawal.completed",
      playerId: w.playerId,
      currency: currencyById.get(String(w.currency)) || "INR",
      occurredAt: w.createdAt,
      data: { amountCents: toCents(w.amount) },
    }));
  }

  // ── casino ───────────────────────────────────────────────────────────────
  //
  // `result` is a round's outcome, not a win: 222,880 of 348,490 carry zero,
  // which are the rounds the player lost. Emitting those as wins would leave
  // the win count matching the bet count and GGR computed from a game nobody
  // ever loses. A zero result is a round that already had its bet event, so it
  // needs no second event of its own.
  const casino = db.collection("casinoTransactionsV2");
  const TYPE_EVENT = { bet: "casino.bet.placed", result: "casino.win.settled", rollback: "casino.bet.rollback" };
  for await (const t of casino.find({ createdAt: { $gte: SINCE } })) {
    const type = TYPE_EVENT[t.type];
    if (!type) { bump("skipped:casino_unknown_type:" + t.type); continue; }
    // real_money_amount, not amount. They are identical in this data because
    // bonus play is not in use yet — which is exactly why it has to be the one
    // the mapping reads, so the day bonuses arrive the GGR does not quietly
    // start counting bonus money as revenue.
    const cents = toCents(t.real_money_amount ?? t.amount);
    if (type === "casino.win.settled" && cents === 0) { bump("skipped:losing_round"); continue; }
    const data = { roundId: String(t.round_id || t._id), gameId: t.game_code, providerId: t.aggregator };
    if (type === "casino.win.settled") data.winCents = cents;
    else data.betCents = cents;
    await emit(envelope({
      id: eventId("casinoTransactionsV2", t._id, type),
      type,
      playerId: t.player_id,
      currency: t.currency || "INR",
      occurredAt: t.createdAt,
      data,
    }));
  }

  if (COMMIT && batch.length) await producer.send({ topic: TOPIC, messages: batch });

  console.log("— produced —");
  Object.keys(counts).sort().forEach((k) => console.log(`  ${String(counts[k]).padStart(8)}  ${k}`));

  if (COMMIT) await producer.disconnect();
  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(`\n${e.message}`);
  if (/ECONNREFUSED|ETIMEDOUT|ServerSelection/i.test(e.message)) {
    console.error("10.20.0.x is private — this needs the Betroxy VPN to be up.");
  }
  process.exit(1);
});
