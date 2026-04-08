const { execFile } = require("child_process");
const path = require("path");
const mongoose = require("mongoose");
const { acquireSeedLock } = require("./seedLock");
const { logger } = require("../middlewares/logger");

const seeds = [
  "counterSeed.js", // always safe (idempotent)
  "countrySeed.js",
  "languageSeed.js",
  "currencySeed.js",
  "revenueSeed.js",
  "categorySeed.js",
  "providersSeed.js",
  "permissionsSeed.js",
  "rolesSeed.js",
  "affiliateSeed.js",
];

const COLLECTIONS = {
  countries: "countrySeed.js",
  languages: "languageSeed.js",
  currencies: "currencySeed.js",
  revenues: "revenueSeed.js",
  ourcategories: "categorySeed.js",
  providers: "providersSeed.js",
  permissions: "permissionsSeed.js",
  roles: "rolesSeed.js",
  affiliates: "affiliateSeed.js",
};

function resolveDbInfo() {
  const uri =
    process.env.MONGODB_MAIN_DB_URI ||
    process.env.MONGODB_URI ||
    "mongodb://localhost:27017/pixupplay-db";

  const dbName =
    process.env.MONGODB_MAIN_DB_NAME ||
    process.env.MONGODB_DB ||
    (uri.split("/").pop() || "pixupplay-db").split("?")[0];

  return { uri, dbName };
}

async function getCounts(uri) {
  await mongoose.connect(uri);
  try {
    const out = {};
    for (const name of Object.keys(COLLECTIONS)) {
      out[name] = await mongoose.connection.db
        .collection(name)
        .estimatedDocumentCount();
    }
    return out;
  } finally {
    await mongoose.disconnect();
  }
}

function run(seedFile) {
  return new Promise((resolve, reject) => {
    const full = path.join(__dirname, seedFile);
    logger.info("seed.runAll.seed_start", { seedFile });
    execFile(
      process.execPath,
      [full],
      { env: process.env, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (stdout) process.stdout.write(stdout);
        if (stderr) process.stderr.write(stderr);
        if (err) return reject(err);
        resolve();
      }
    );
  });
}

(async () => {
  let lock;
  try {
    const { uri, dbName } = resolveDbInfo();
    const FORCE = String(process.env.FORCE || "").toLowerCase() === "true";

    // Prevent concurrent seed runs across processes
    lock = await acquireSeedLock(uri, dbName);

    const counts = await getCounts(uri);

    if (FORCE) {
      // conservative: collections must be empty (same behavior you had)
      const nonEmpty = Object.entries(counts).filter(([, c]) => c > 0);
      if (nonEmpty.length) {
        const detail = nonEmpty.map(([n, c]) => `${n}:${c}`).join(", ");
        throw new Error(
          `Abort seeding (FORCE): collections not empty -> ${detail}. Drop first.`
        );
      }
      for (const s of seeds) await run(s);
    } else {
      // Idempotent mode:
      // - Always run counters init (safe, inserts only if missing)
      // - For each collection, if it already has docs, SKIP its seed
      //   so re-running this script won't rewrite existing data.
      // - No-op for collections with data present.
      // counters always safe to run
      await run("counterSeed.js");

      for (const [coll, file] of Object.entries(COLLECTIONS)) {
        // Existence check: skip seeding if target collection is not empty
        if (counts[coll] > 0) {
          logger.info("seed.runAll.skip", {
            file,
            collection: coll,
            existingDocs: counts[coll],
          });
        } else {
          await run(file);
        }
      }
    }

    logger.info("seed.runAll.complete");
    process.exit(0);
  } catch (err) {
    logger.error("seed.runAll.failure", { error: err });
    process.exit(1);
  } finally {
    try {
      if (lock) await lock.release();
    } catch (_) {
      // ignore release errors
    }
  }
})();
