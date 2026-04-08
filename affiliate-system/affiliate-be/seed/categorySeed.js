const connectDB = require("../config/db");
const OurCategory = require("../models/OurCategory");
const { logger } = require("../middlewares/logger");

const data = [
  {
    name: "Live Casino",
    icon: "",
    isDeleted: false,

    sort: 3,
    "isAllowed:": true,
    group: "Live Casino",
    aliases: ["Live Casino", "Live-Casino", "Live_Casino", "Livecasino"],
  },
  {
    name: "Slots",
    icon: "",
    isDeleted: false,

    sort: 2,
    isAllowed: true,
    group: "Slots",
    aliases: ["Slots"],
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
    aliases: ["Casual Games", "Casual-Games", "Casual_Games", "Casualgames"],
  },
  {
    name: "Baccarat",
    icon: "",
    sort: 0,
    isAllowed: true,
    group: "Slots",
    aliases: ["Baccarat"],
  },
  {
    name: "Top Card",
    icon: "",
    sort: 0,
    isAllowed: false,
    group: "Slots",
    aliases: ["Top Card", "Top-Card", "Top_Card", "Topcard"],
  },
  {
    name: "Blackjack",
    icon: "",
    sort: 0,
    isAllowed: true,
    group: "Slots",
    aliases: ["Blackjack"],
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
    ],
  },
  {
    name: "Live Lobby",
    icon: "",
    sort: 0,
    isAllowed: true,
    group: "Live Casino",
    aliases: ["Live Lobby", "Live-Lobby", "Live_Lobby", "Livelobby"],
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
    aliases: ["Lottery"],
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
    ],
  },
  {
    name: "Roulette",
    icon: "",
    sort: 0,
    isAllowed: true,
    group: "Roulette",
    aliases: ["Roulette"],
  },
  {
    name: "Poker",
    icon: "",
    sort: 0,
    isAllowed: false,
    group: "Slots",
    aliases: ["Poker"],
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
    icon: "",
    sort: 0,
    isAllowed: false,
    group: "Other",
  },
  {
    name: "test",
    isDeleted: false,
    sort: 0,
    isAllowed: true,
    isDisplayed: false,
  },
  {
    name: "customCategory",
    isDeleted: false,
    sort: 0,
    isAllowed: true,
    isDisplayed: false,
  },
  {
    name: "custom2",
    isDeleted: false,
    sort: 0,
    isAllowed: true,
    isDisplayed: false,
  },
  {
    name: "hh",
    isDeleted: true,
    sort: 0,
    isAllowed: false,
    isDisplayed: false,
  },
  {
    name: "tt",
    isDeleted: true,
    sort: 0,
    isAllowed: false,
    isDisplayed: false,
  },
  {
    name: "Other",
    isDeleted: false,
    sort: 0,
    isAllowed: true,
    isDisplayed: true,

    aliases: ["Other"],
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

const seed = async () => {
  try {
    await connectDB();
    await OurCategory.deleteMany({});
    await OurCategory.insertMany(data);
    logger.info("seed.categories.success");
  } catch (error) {
    logger.error("seed.categories.failure", { error });
  }
};

seed();
