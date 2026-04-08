// tools/sync-ourcategory-aliases.js
/* eslint-disable no-console */
const mongoose = require("mongoose");

const REPLACE_ALIASES = false;
const CASE_INSENSITIVE = false;

// ---- MongoDB connection string ----
const MONGO_URI =
  "mongodb://10.20.0.4:27017,10.20.0.4:27018,10.20.0.4:27019/betroxy-db?replicaSet=rsData";

// ---- OurCategory Schema/Model ----
const ourCategorySchema = new mongoose.Schema(
  {
    name: { type: String, index: true, required: true },
    aliases: { type: [String], default: [] },
    icon: { type: String, default: "" },
    isDeleted: { type: Boolean, default: false },
    sort: { type: Number, default: 0 },
    isAllowed: { type: Boolean, default: true },
    group: { type: String, default: "Other" },
    isDisplayed: { type: Boolean, default: true },
  },
  { collection: "ourcategories", strict: true }
);
const OurCategory = mongoose.model("OurCategory", ourCategorySchema);

const data = [
  {
    name: "Live Casino",
    icon: "",
    isDeleted: false,

    sort: 3,
    isAllowed: true,
    group: "Live Casino",
    aliases: [
      "Live Casino",
      "Live-Casino",
      "Live_Casino",
      "Livecasino",
      "LIVE",
      "Live",
      "Live Games",
      "Live Popular",
    ],
  },
  {
    name: "Slots",
    icon: "",
    isDeleted: false,

    sort: 2,
    isAllowed: true,
    group: "Slots",
    aliases: [
      "Slots",
      "Slot",
      "Slot Game",
      "Slot game",
      "SLOT",
      "slot",
      "Premium Slots",
    ],
  },
  {
    name: "Game Shows",
    icon: "",
    isDeleted: false,

    sort: 4,
    isAllowed: true,
    group: "Game Shows",
    aliases: [
      "Game Show",
      "Game Shows",
      "Game-Shows",
      "Game_Shows",
      "Gameshows",
      "Wheel of Fortune",
      "Live Wheel of Fortune",
    ],
  },
  {
    name: "Crash Games",
    icon: "",
    isDeleted: false,

    sort: 5,
    isAllowed: true,
    group: "Crash Games",
    aliases: [
      "Crash",
      "Crash Games",
      "Crash-Games",
      "Crash_Games",
      "Crashgames",
      "Crash Game",
    ],
  },
  {
    name: "New Releases",
    icon: "",
    isDeleted: false,

    sort: 6,
    isAllowed: true,
    group: "Other",
    aliases: ["New Releases", "New-Releases", "New_Releases", "Newreleases"],
  },
  {
    name: "Game Show",
    icon: "",
    sort: 0,
    isAllowed: false,
    group: "Game Shows",
  },
  {
    name: "Live Dealer",
    icon: "",
    sort: 0,
    isAllowed: false,
    group: "Live Casino",
    aliases: [
      "Live Dealer",
      "Live Dealers",
      "Live-Dealer",
      "Live_Dealer",
      "Livedealer",
    ],
  },
  {
    name: "Live Sic Bo",
    icon: "",
    sort: 0,
    isAllowed: false,
    group: "Live Casino",
    aliases: [
      "Live Si C Bo",
      "Live Sic Bo",
      "Live Sicbo",
      "Live-Sic-Bo",
      "Live_Sic_Bo",
      "Livesicbo",
      "Sic Bo",
      "sicbo",
    ],
  },
  {
    name: "Live Dragon Tiger",
    icon: "",
    sort: 0,
    isAllowed: false,
    group: "Live Casino",
    aliases: [
      "Live Dragon Tiger",
      "Live-Dragon-Tiger",
      "Live_Dragon_Tiger",
      "Livedragontiger",
    ],
  },
  {
    name: "Casual Games",
    icon: "",
    sort: 0,
    isAllowed: false,
    group: "Slots",
    aliases: [
      "Casual Games",
      "Casual-Games",
      "Casual_Games",
      "Casualgames",
      "Arcade",
      "Arcade game",
      "Instant Game",
    ],
  },
  {
    name: "Baccarat",
    icon: "",
    sort: 0,
    isAllowed: true,
    group: "Slots",
    aliases: ["Baccarat", "baccarat", "Bacarrat"],
  },
  {
    name: "Top Card",
    icon: "",
    sort: 0,
    isAllowed: false,
    group: "Slots",
    aliases: [
      "Top Card",
      "Top-Card",
      "Top_Card",
      "Topcard",
      "32cards",
      "lucky7",
      "card",
      "Card Game",
    ],
  },
  {
    name: "Blackjack",
    icon: "",
    sort: 0,
    isAllowed: true,
    group: "Slots",
    aliases: ["Blackjack", "blackjack"],
  },
  {
    name: "Dragon Tiger",
    icon: "",
    sort: 0,
    isAllowed: false,
    group: "Slots",
    aliases: ["Dragon Tiger", "Dragon-Tiger", "Dragon_Tiger", "Dragontiger"],
  },
  {
    name: "Live Baccarat",
    icon: "",
    sort: 0,
    isAllowed: true,
    group: "Live Casino",
    aliases: [
      "Live Baccarat",
      "Live-Baccarat",
      "Live_Baccarat",
      "Livebaccarat",
    ],
  },
  {
    name: "Live Blackjack",
    icon: "",
    sort: 0,
    isAllowed: true,
    group: "Live Casino",
    aliases: [
      "Live Blackjack",
      "Live-Blackjack",
      "Live_Blackjack",
      "Liveblackjack",
    ],
  },
  {
    name: "Live Poker",
    icon: "",
    sort: 0,
    isAllowed: true,
    group: "Live Casino",
    aliases: ["Live Poker", "Live-Poker", "Live_Poker", "Livepoker"],
  },
  {
    name: "Video Slots",
    icon: "",
    sort: 0,
    isAllowed: false,
    group: "Slots",
    aliases: [
      "Video Slot",
      "Video Slots",
      "Video-Slots",
      "Video_Slots",
      "Videoslots",
    ],
  },
  {
    name: "Table Games",
    icon: "",
    sort: 0,
    isAllowed: true,
    group: "Table Games",

    aliases: [
      "Table",
      "Table Games",
      "Table-Games",
      "Table_Games",
      "Tablegames",
      "Table Game",
      "TABLE",
    ],
  },
  {
    name: "Live Lobby",
    icon: "",
    sort: 0,
    isAllowed: true,
    group: "Live Casino",
    aliases: [
      "Live Lobby",
      "Live-Lobby",
      "Live_Lobby",
      "Livelobby",
      "LOBBY",
      "Lobby",
      "lobby",
    ],
  },
  {
    name: "Live Lottery",
    icon: "",
    sort: 0,
    isAllowed: false,
    group: "Other",
    aliases: ["Live Lottery", "Live-Lottery", "Live_Lottery", "Livelottery"],
  },
  {
    name: "Lottery",
    icon: "",
    sort: 0,
    isAllowed: false,
    group: "Lottery Games",
    aliases: ["Lottery", "LOTTO", "Lotto", "Bingo game", "Keno"],
  },
  {
    name: "Virtual Sports",
    icon: "",
    sort: 0,
    isAllowed: false,
    group: "Virtual Games",
    aliases: [
      "Virtual Sports",
      "Virtual-Sports",
      "Virtual_Sports",
      "Virtualsports",
      "Virtual",
      "Virtual sports",
      "VIRTUAL",
      "Sports",
      "sports",
    ],
  },
  {
    name: "Fishing Games",
    icon: "",
    sort: 0,
    isAllowed: false,
    group: "Other",
    aliases: [
      "Fishing Games",
      "Fishing-Games",
      "Fishing_Games",
      "Fishinggames",
      "Fish Shooting",
    ],
  },
  {
    name: "Roulette",
    icon: "",
    sort: 0,
    isAllowed: true,
    group: "Roulette",
    aliases: ["Roulette", "roulette"],
  },
  {
    name: "Poker",
    icon: "",
    sort: 0,
    isAllowed: false,
    group: "Slots",
    aliases: ["Poker", "poker", "Video Poker"],
  },
  {
    name: "Live Roulette",
    icon: "",
    sort: 0,
    isAllowed: true,
    group: "Live Casino",

    aliases: [
      "Live Roulette",
      "Live-Roulette",
      "Live_Roulette",
      "Liveroulette",
    ],
  },
  {
    name: "Scratch Card",
    icon: "",
    sort: 0,
    isAllowed: false,
    group: "Crash Games",
    aliases: ["Scratch Card", "Scratch-Card", "Scratch_Card", "Scratchcard"],
  },
  {
    name: "Others",
    isDeleted: false,
    sort: 0,
    isAllowed: true,
    isDisplayed: true,

    aliases: ["Other", "Unknown"],
  },
  {
    name: "Lottery Games",
    isDeleted: false,
    sort: 0,
    isAllowed: true,
    isDisplayed: true,

    aliases: [
      "Lottery",
      "Lottery Games",
      "Lottery-Games",
      "Lottery_Games",
      "Lotterygames",
    ],
  },
  {
    name: "Virtual Games",
    isDeleted: false,
    sort: 0,
    isAllowed: true,
    isDisplayed: false,

    aliases: [
      "Virtual Game",
      "Virtual Games",
      "Virtual-Games",
      "Virtual_Games",
      "Virtualgames",
    ],
  },
  {
    name: "Jackpot Games",
    sort: 0,
    isAllowed: true,
  },
  {
    name: "Top Games",
    sort: 0,
    isAllowed: true,

    aliases: ["Top Games", "Top-Games", "Top_Games", "Topgames"],
  },
  {
    name: "Popular Games",
    sort: 0,
    isAllowed: true,
  },
  {
    name: "VIP Tables",
    sort: 0,
    isAllowed: true,
  },
  {
    name: "High Roller Games",
    sort: 0,
    isAllowed: true,
  },
  {
    name: "Megaways Slots",
    sort: 0,
    isAllowed: true,
  },
  {
    name: "Classic Slots / Fruit Slots",
    sort: 0,
    isAllowed: true,

    aliases: [
      "Classic Slots",
      "Classic Slots  Fruit Slots",
      "Classic-Slots--Fruit-Slots",
      "Classic_Slots__Fruit_Slots",
      "Classicslotsfruitslots",
      "Fruit Slots",
    ],
  },
  {
    name: "Instant Win",
    sort: 0,
    isAllowed: true,
  },
  {
    name: "Mini Games",
    sort: 0,
    isAllowed: true,
  },
  {
    name: "Craps",
    sort: 0,
    isAllowed: true,
    aliases: ["Craps"],
  },
  {
    name: "Poker (RNG)",
    sort: 0,
    isAllowed: true,
  },
  {
    name: "Andar Bahar / Teen Patti",
    sort: 0,
    isAllowed: true,
    aliases: ["Andar Bahar", "TeenPatti", "andar_bahar"],
  },
  {
    name: "Branded Games",
    sort: 0,
    isAllowed: true,
    aliases: [
      "Branded Games",
      "Branded-Games",
      "Branded_Games",
      "Brandedgames",
    ],
  },
  {
    name: "Dice / Sic Bo",
    sort: 0,
    isAllowed: true,
  },
  {
    name: "Trending Now",
    sort: 0,
    isAllowed: true,
  },
  {
    name: "Buy Bonus Slots",
    sort: 0,
    isAllowed: true,
  },
  {
    name: "Money Wheel",
    sort: 0,
    isAllowed: true,
    aliases: ["Money Wheel", "Money-Wheel", "Money_Wheel", "Moneywheel"],
  },
];

// ---- Helpers ----
const cleanAliases = (arr) => {
  const items = (arr || [])
    .map((a) => (typeof a === "string" ? a.trim() : ""))
    .filter(Boolean);
  return [...new Set(items)]; // uniq
};

// Regex escape helper (CASE_INSENSITIVE)
function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function run() {
  await mongoose.connect(MONGO_URI);

  let processed = 0;
  let matched = 0;
  let modified = 0;
  let upserted = 0;
  const notFound = [];

  for (const item of data) {
    const { name } = item;
    if (!name) continue;

    const cleanedAliases = cleanAliases(item.aliases);

    const filter = CASE_INSENSITIVE
      ? { name: new RegExp(`^${escapeRegExp(name)}$`, "i") }
      : { name };

    // Upsert
    const baseSetOnInsert = {
      name: item.name,
      icon: item.icon ?? "",
      isDeleted: item.isDeleted ?? false,
      sort: item.sort ?? 0,
      isAllowed: item.isAllowed ?? true,
      group: item.group ?? "Other",
      isDisplayed:
        typeof item.isDisplayed === "boolean" ? item.isDisplayed : true,
    };

    const update = REPLACE_ALIASES
      ? {
          $set: { aliases: cleanedAliases },
          $setOnInsert: baseSetOnInsert,
        }
      : {
          $addToSet: { aliases: { $each: cleanedAliases } },
          $setOnInsert: baseSetOnInsert,
        };

    try {
      const res = await OurCategory.updateOne(filter, update, {
        upsert: true, // <--- Add if not exists
      });

      processed += 1;
      const matchedCount = res.matchedCount ?? res.nMatched ?? 0;
      const modifiedCount = res.modifiedCount ?? res.nModified ?? 0;
      const upsertedId =
        res.upsertedId || (Array.isArray(res.upserted) && res.upserted[0]);

      matched += matchedCount;
      modified += modifiedCount;
      if (upsertedId) {
        upserted += 1;
        console.log(
          `[ADD] Inserted new category: ${name} (${cleanedAliases.length} aliases)`
        );
      } else if (modifiedCount > 0) {
        console.log(
          `[OK] ${
            REPLACE_ALIASES ? "Replaced" : "Merged"
          } aliases for: ${name} (${cleanedAliases.length} values)`
        );
      } else if (matchedCount > 0) {
        console.log(`[SKIP] No change for: ${name}`);
      } else {
        // teorik olarak upsert:true olduğundan buraya düşmemeli
        notFound.push(name);
        console.warn(`[WARN] Not found by name (unexpected): ${name}`);
      }
    } catch (e) {
      console.error(`[ERROR] Update failed for "${name}":`, e.message);
    }
  }

  console.log("---- Summary ----");
  console.log({
    processed,
    matched_docs: matched,
    modified_docs: modified,
    upserted_docs: upserted,
    unexpected_not_found: notFound,
    options: { REPLACE_ALIASES, CASE_INSENSITIVE },
  });

  await mongoose.disconnect();
}

run().catch((e) => {
  console.error("[FATAL] Script crashed:", e);
  process.exit(1);
});
