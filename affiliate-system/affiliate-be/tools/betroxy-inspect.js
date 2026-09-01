"use strict";

// Read-only reconnaissance of Betroxy's own database, before writing any
// backfill against it.
//
// Their platform is not ours: the collection names were given verbally
// (deposittransactions, withdrawaltransactions, "and the rest"), and the field
// names, the units, the currency handling and how a player is identified are
// all unknown. Writing a mapping against a guess and running it over two months
// of history produces numbers that look right and are not — and once
// ActivityHourly rows are in, the wrong ones are indistinguishable from the
// right ones.
//
// So: look first. This opens nothing but a read connection, writes nothing, and
// prints what is actually there.
//
//   BETROXY_MONGODB_URI="mongodb://10.20.0.4:27017,…/betroxy-db?replicaSet=rsData" \
//     node tools/betroxy-inspect.js [--since 2026-07-01]
//
// Requires the Betroxy VPN: 10.20.0.x is not routable from here otherwise.

const mongoose = require("mongoose");

const URI = process.env.BETROXY_MONGODB_URI;
const SINCE = new Date(
  (process.argv.includes("--since") ? process.argv[process.argv.indexOf("--since") + 1] : null) ||
    "2026-07-01T00:00:00Z"
);

// What the backfill will need to fill, so the report can say plainly which of
// these the source can answer and which will have to be zero.
const NEEDED = [
  "betsSumCents", "winsSumCents",
  "casinoBetsRollbacksSumCents", "casinoWinsRollbacksSumCents",
  "depositsCount", "depositsSumCents",
  "cashoutsCount", "cashoutsSumCents",
  "bonusIssuesSumCents", "additionalDeductionsSumCents",
  "paymentSystemFeesSumCents", "jackpotFeesSumCents",
  "gameProviderFeesSumCents", "casinoTaxesSumCents",
  "roundsCount",
  "registrations", "ftdCount", "ftdSumCents",
  "chargebacksCount", "chargebacksSumCents",
];

const isDateish = (v) => v instanceof Date;
const shape = (doc, prefix = "", depth = 0) => {
  const out = [];
  for (const [k, v] of Object.entries(doc || {})) {
    const path = prefix ? `${prefix}.${k}` : k;
    const t = v === null ? "null"
      : isDateish(v) ? "Date"
      : Array.isArray(v) ? `Array(${v.length})`
      : v && v._bsontype ? v._bsontype
      : typeof v;
    out.push(`${path}: ${t}${t === "string" || t === "number" ? ` = ${JSON.stringify(v).slice(0, 40)}` : ""}`);
    if (t === "object" && depth < 1) out.push(...shape(v, path, depth + 1));
  }
  return out;
};

const run = async () => {
  if (!URI) {
    console.error("BETROXY_MONGODB_URI is required.");
    process.exit(1);
  }

  // Short timeout: behind a VPN, "hangs forever" and "not connected" look the
  // same, and the second one is the answer that tells you what to do.
  await mongoose.connect(URI, {
    serverSelectionTimeoutMS: 8000,
    directConnection: false,
    readPreference: "secondaryPreferred",
  });
  const db = mongoose.connection.db;
  console.log(`connected: ${db.databaseName}\n`);

  const all = await db.listCollections().toArray();
  const names = all.map((c) => c.name).sort();

  console.log(`— ${names.length} collections —`);
  const interesting = [];
  for (const name of names) {
    const n = await db.collection(name).estimatedDocumentCount().catch(() => -1);
    if (n > 0) {
      console.log(`  ${String(n).padStart(10)}  ${name}`);
      if (/transaction|deposit|withdraw|bet|win|round|game|player|user|bonus|affiliate|referr/i.test(name)) {
        interesting.push(name);
      }
    }
  }

  for (const name of interesting) {
    const coll = db.collection(name);
    console.log(`\n═══ ${name} ═══`);

    // Which field carries time. Everything downstream buckets by it, and
    // picking the wrong one silently shifts the whole history.
    const sample = await coll.findOne({});
    if (!sample) { console.log("  (empty)"); continue; }

    const dateFields = Object.entries(sample)
      .filter(([, v]) => isDateish(v))
      .map(([k]) => k);
    console.log(`  date fields: ${dateFields.join(", ") || "NONE — cannot bucket by period"}`);

    for (const f of dateFields) {
      const since = await coll.countDocuments({ [f]: { $gte: SINCE } }).catch(() => -1);
      const total = await coll.estimatedDocumentCount().catch(() => -1);
      console.log(`    ${f}: ${since} of ${total} since ${SINCE.toISOString().slice(0, 10)}`);
    }

    console.log("  shape:");
    shape(sample).forEach((l) => console.log(`    ${l}`));
  }

  console.log("\n— what the import needs —");
  console.log(NEEDED.join(", "));
  console.log("\nEvery one is required and must be a non-negative number. Anything");
  console.log("this database cannot answer has to be a stated zero rather than an");
  console.log("assumed one: a fee the source does not record is not a fee of nil.");

  await mongoose.disconnect();
  process.exit(0);
};

run().catch((e) => {
  console.error(`\nfailed: ${e.message}`);
  if (/ECONNREFUSED|ETIMEDOUT|ENOTFOUND|ServerSelection/i.test(e.message)) {
    console.error("10.20.0.x is private — this needs the Betroxy VPN to be up.");
  }
  process.exit(1);
});
