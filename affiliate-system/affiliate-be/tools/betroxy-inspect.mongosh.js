// Read-only reconnaissance of Betroxy's database, run ON their server.
//
//   mongosh "mongodb://localhost:27017/betroxy-db?replicaSet=rsData" \
//     --quiet --file betroxy-inspect.mongosh.js
//
// mongosh rather than a Node script against mongoose: this runs on their box,
// and a script that needs `npm install` on someone else's production server is
// a script that does not get run. A Mongo host already has mongosh.
//
// It writes nothing. Their platform is not ours — the collection names came
// verbally and the field names, units, currency handling and player identity
// are all unknown. A mapping written against a guess and run over two months of
// history produces numbers that look right and are not, and once they are in
// ActivityHourly the wrong ones are indistinguishable from the right ones.

const SINCE = new Date("2026-07-01T00:00:00Z");

// What the import requires. Printed at the end because the useful answer is not
// what this database has — it is which of these it cannot answer.
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

const typeOf = (v) =>
  v === null ? "null"
  : v instanceof Date ? "Date"
  : Array.isArray(v) ? "Array(" + v.length + ")"
  : v && v._bsontype ? v._bsontype
  : typeof v;

function shape(doc, prefix, depth) {
  prefix = prefix || ""; depth = depth || 0;
  Object.keys(doc || {}).forEach(function (k) {
    const v = doc[k];
    const path = prefix ? prefix + "." + k : k;
    const t = typeOf(v);
    let line = "    " + path + ": " + t;
    if (t === "string" || t === "number") line += " = " + JSON.stringify(v).slice(0, 44);
    print(line);
    if (t === "object" && depth < 1) shape(v, path, depth + 1);
  });
}

print("database: " + db.getName() + "\n");

const names = db.getCollectionNames().sort();
print("— collections with documents —");
const interesting = [];
names.forEach(function (name) {
  let n = 0;
  try { n = db.getCollection(name).estimatedDocumentCount(); } catch (e) { n = -1; }
  if (n > 0) {
    print("  " + String(n).padStart(11) + "  " + name);
    if (/transaction|deposit|withdraw|bet|win|round|game|player|user|bonus|affiliate|referr|chargeback|rollback/i.test(name)) {
      interesting.push(name);
    }
  }
});

interesting.forEach(function (name) {
  const coll = db.getCollection(name);
  print("\n═══ " + name + " ═══");
  const sample = coll.findOne({});
  if (!sample) { print("  (empty)"); return; }

  // Which field carries time. Everything downstream buckets by it, and a
  // transaction commonly has three — created, processed, completed — that give
  // three different answers. Reported rather than chosen: picking the wrong one
  // silently shifts the entire history.
  const dateFields = Object.keys(sample).filter(function (k) { return sample[k] instanceof Date; });
  print("  date fields: " + (dateFields.join(", ") || "NONE — cannot bucket by period"));
  dateFields.forEach(function (f) {
    const q = {}; q[f] = { $gte: SINCE };
    let since = -1;
    try { since = coll.countDocuments(q); } catch (e) {}
    print("    " + f + ": " + since + " since " + SINCE.toISOString().slice(0, 10));
  });

  // Currency and status matter as much as the amount: a pending withdrawal and
  // a settled one are not the same money, and mixing currencies into one sum is
  // a number with no meaning.
  ["currency", "status", "state", "type", "kind"].forEach(function (f) {
    if (sample[f] === undefined) return;
    let vals = [];
    try { vals = coll.distinct(f).slice(0, 12); } catch (e) {}
    if (vals.length) print("  " + f + " values: " + vals.join(", "));
  });

  print("  shape:");
  shape(sample);
});

print("\n— what the import needs —");
print(NEEDED.join(", "));
print("");
print("Every one is required and must be a non-negative number. Anything this");
print("database cannot answer has to be a stated zero rather than an assumed");
print("one: a fee the source does not record is not a fee of nil, and NGR is");
print("computed from these — commission is paid on the result.");
