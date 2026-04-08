const { default: mongoose } = require("mongoose");
const connectDB = require("../config/db");
const GameV2 = require("../models/GameV2");
const { logger } = require("../middlewares/logger");

const batchSize = 500;

// this tool is used for converting available games in 'games' collection to the
// new 'GameV2Schema' and inserting them to 'gamesV2' collection.
// it should be run against empty 'gamesV2' collection and should be used in development phase.

async function migrateGameCollection() {
  await connectDB();

  // want to access all fields of games collection
  const Game = mongoose.model(
    "GameAllFields",
    new mongoose.Schema(
      {},
      {
        strict: false,
        collection: "games", // specify the collection name
      }
    )
  );
  const cursor = Game.find({}).cursor();

  let i = 0;
  let games = [];
  for await (const game of cursor) {
    let gameV2 = new GameV2();
    gameV2.id = game.id;
    gameV2.game_code = game.game_code;
    gameV2.game_name = game.game_name;
    gameV2.aggregator = game.aggregator;
    switch (game.aggregator) {
      case "st8":
        gameV2.provider = game.provider;
        break;
      case "new-delhi":
        gameV2.provider = game.sub_provider_name;
        gameV2.sub_aggregator = game.provider_name;
        break;
      default:
        throw new Error(`Unsupported aggregator: ${game.aggregator}`);
    }
    gameV2.category = game.category;
    gameV2.rtp = game.rtp;
    gameV2.url_thumb = game.url_thumb;
    gameV2.priority = game.priority;
    gameV2.admin_allowed = game.adminAllowed;
    gameV2.deleted = game.deleted;
    gameV2.device_support = game.device_support;
    gameV2.has_demo = game.has_demo;
    gameV2.has_freespins = game.has_freespins;
    gameV2.custom_thumbnail = game.custom_thumbnail;
    if (Array.isArray(game.our_category)) {
      gameV2.our_category = game.our_category;
    } else {
      gameV2.our_category = [game.our_category];
    }
    games.push(gameV2);
    i++;
    if (i === batchSize) {
      await GameV2.bulkSave(games);
      i = 0;
      games = [];
    }
  }

  if (games.length > 0) {
    await GameV2.bulkSave(games);
  }
}

// run it for staging with MONGODB_URI="mongodb://157.90.66.248:27017/pixupplay-db"  node game-migrator.js
migrateGameCollection()
  .then(() => {
    logger.info("tools.game_migrator.success");
    process.exit(0);
  })
  .catch((err) => {
    logger.error("tools.game_migrator.error", { error: err });
    process.exit(1);
  });
