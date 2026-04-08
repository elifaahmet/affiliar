const mongoose = require("mongoose");
const providerAliases = require("./providerAliases");
const { logger } = require("../middlewares/logger");
// 1. MongoDB connection string
const MONGO_URI =
  "mongodb://43.204.212.59:27017,43.204.212.59:27018,43.204.212.59:27019/pixupplay-db?replicaSet=rsData";

// 3. Define Mongoose schema
const providerSchema = new mongoose.Schema(
  {
    name: String,
    aliases: [String],
  },
  { collection: "providers" }
);

const Provider = mongoose.model("Provider", providerSchema);

async function updateAliases() {
  try {
    await mongoose.connect(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    for (const [name, rawAliases] of Object.entries(providerAliases)) {
      // Force any value to be a string array
      let aliases = [];

      if (Array.isArray(rawAliases)) {
        aliases = rawAliases;
      } else if (typeof rawAliases === "string") {
        aliases = [rawAliases];
      } else if (rawAliases != null) {
        aliases = [String(rawAliases)];
      }

      const cleanedAliases = aliases
        .map((a) => (typeof a === "string" ? a.trim() : ""))
        .filter(Boolean);

      try {
        const result = await Provider.findOneAndUpdate(
          { name },
          { $set: { aliases: cleanedAliases } },
          { new: true }
        );

        if (result) {
          logger.info("tools.providers.alias_updated", { name });
        } else {
          logger.warn("tools.providers.alias_not_found", { name });
        }
      } catch (innerErr) {
        logger.error("tools.providers.alias_update_error", {
          name,
          error: innerErr,
        });
      }
    }

    await mongoose.disconnect();
    logger.info("tools.providers.alias_update_complete");
  } catch (err) {
    logger.error("tools.providers.alias_update_db_error", { error: err });
  }
}

updateAliases();
