const mongoose = require("mongoose");
const { logger } = require("../middlewares/logger");

mongoose.connect("mongodb://157.90.66.248:27019/pixupplay-db", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const ourCategorySchema = new mongoose.Schema({ name: String, group: String });
const OurCategory = mongoose.model("ourcategories", ourCategorySchema);

const combinedCategories = {
  Slots: ["Slots", "Video Slots"],
  "Live Casino": [
    "Live Roulette",
    "Live Baccarat",
    "Live Blackjack",
    "Live Dealer",
    "Live Dragon Tiger",
    "Live Lobby",
    "Live Poker",
    "Live Sic Bo",
    "Live Casino",
  ],
  "Lottery Games": ["Lottery"],
  "Virtual Games": ["Virtual Sports"],
  "Table Games": ["Table Games"],
  "Crash Games": ["Crash Games"],
  "Game Shows": ["Game Shows"],
  Roulette: ["Roulette"],
};

// Build reverse mapping
const subcategoryToGroup = {};
for (const [group, subs] of Object.entries(combinedCategories)) {
  subs.forEach((sub) => {
    subcategoryToGroup[sub] = group;
  });
}

async function updateCategories() {
  const all = await OurCategory.find();

  for (const doc of all) {
    const group = subcategoryToGroup[doc.name] || "Uncategorized";
    doc.group = group;
    await doc.save();
    logger.info("tools.categories.group_assigned", {
      name: doc.name,
      group,
    });
  }

  // 🔁 Rename Uncategorized → Other
  const { modifiedCount } = await OurCategory.updateMany(
    { group: "Uncategorized" },
    { $set: { group: "Other" } }
  );
  logger.info("tools.categories.reassigned_uncategorized", {
    modifiedCount,
  });

  mongoose.connection.close();
}

updateCategories().catch((err) => {
  logger.error("tools.categories.group_assignment_error", { error: err });
  mongoose.connection.close();
});
