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
const { Kafka, logLevel } = require(path.join(__dirname, "../node_modules/kafkajs"));
const crypto = require("crypto");

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const COMMIT = process.argv.includes("--commit");
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
 * A backfill that cannot be re-run is one you run once and hope. Two months of
 * history will not import cleanly the first time — a field will turn out to
 * mean something else, a currency will be missing — and the fix is to correct
 * the mapping and run it again. With a random id every re-run doubles the
 * history and there is no way back short of dropping the tenant's rows.
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
      { $group: { _id: `$${playerField}`, firstAt: { $min: `$${dateField}` } } },
    ])
    .toArray();
  return new Map(rows.map((r) => [String(r._id), r.firstAt]));
}

/**
 * One source document to zero or more raw events.
 *
 * NOT WRITTEN YET, and deliberately so. Their field names, units (cents or
 * major units), currency handling, and which status counts as settled are all
 * unknown — the collection names came verbally. A mapping written against a
 * guess and run over two months produces numbers that look right and are not,
 * and once they are in ClickHouse the wrong ones are indistinguishable from
 * the right ones.
 *
 * Fill this in from the inspector's output, one collection at a time, and run
 * a --dry-run over a single day before anything else.
 */
function mapDocument() {
  throw new Error(
    "mapDocument() is unimplemented.\n" +
    "Run tools/betroxy-inspect.mongosh.js on their server first, then write the\n" +
    "mapping against what it prints rather than against what the collections are\n" +
    "called."
  );
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

  const kafka = new Kafka({ clientId: "betroxy-backfill", brokers: BROKERS, logLevel: logLevel.ERROR });
  const producer = kafka.producer({ idempotent: true });
  if (COMMIT) await producer.connect();

  // Events are produced in occurredAt order. The consumer's streak, FTD and
  // balance logic reads a sequence, and a July deposit arriving after an August
  // withdrawal is a different history from the one that happened.
  //
  // (The per-collection loop lands here once mapDocument is written.)
  mapDocument();

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
