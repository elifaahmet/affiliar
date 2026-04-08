const mongoose = require("mongoose");
const Game = require("../models/GameV2"); // adjust path
const OurCategory = require("../models/OurCategory"); // adjust path
const { logger } = require("../middlewares/logger");

async function migrateGroupsToCategories() {
  await mongoose.connect("mongodb://157.90.66.248:27019/pixupplay-db"); // replace with your URI

  const categoriesWithGroup = await OurCategory.find({
    group: { $exists: true, $ne: null },
  });

  for (const category of categoriesWithGroup) {
    const groupName = category.group;

    if (!groupName || typeof groupName !== "string" || !groupName.trim()) {
      logger.warn("tools.categories.migrate.invalid_group", {
        categoryId: category._id,
      });
      continue;
    }

    let groupCategory = await OurCategory.findOne({ name: groupName.trim() });
    if (!groupCategory) {
      groupCategory = await OurCategory.create({ name: groupName.trim() });
      logger.info("tools.categories.migrate.created_category", {
        groupName: groupName.trim(),
      });
    }

    const games = await Game.find({ our_category: category._id });
    for (const game of games) {
      const hasGroupAlready = game.our_category.some((id) =>
        id.equals(groupCategory._id)
      );
      if (!hasGroupAlready) {
        game.our_category.push(groupCategory._id);
        await game.save();
        logger.info("tools.categories.migrate.added_group", {
          gameId: game.id,
          groupCategoryId: groupCategory._id,
        });
      }
    }
  }

  logger.info("tools.categories.migrate.complete");
  await mongoose.disconnect();
}

migrateGroupsToCategories().catch((err) => {
  logger.error("tools.categories.migrate.error", { error: err });
});
