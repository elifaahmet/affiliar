const mongoose = require("mongoose");
const fs = require("fs");
const { logger } = require("../middlewares/logger");

// Replace with your MongoDB connection string
const MONGO_URI =
  "mongodb://43.204.212.59:27017,43.204.212.59:27018,43.204.212.59:27019/pixupplay-db?replicaSet=rsData";

const providerSchema = new mongoose.Schema(
  {
    name: String,
    aliases: [String],
  },
  { collection: "providers" }
);

const Provider = mongoose.model("Provider", providerSchema);

async function generateProviderAliases() {
  try {
    await mongoose.connect(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    const providers = await Provider.find({ isDeleted: false }).lean();

    const aliasMap = {};

    providers.forEach((p) => {
      if (p.name) {
        aliasMap[p.name] = Array.isArray(p.aliases) ? p.aliases : [];
      }
    });

    const output = `export const providerAliases: Record<string, string[]> = ${JSON.stringify(
      aliasMap,
      null,
      2
    )};`;

    fs.writeFileSync("providerAliases.ts", output);
    logger.info("tools.provider_aliases.written", {
      file: "providerAliases.ts",
    });

    await mongoose.disconnect();
  } catch (err) {
    logger.error("tools.provider_aliases.error", { error: err });
    mongoose.disconnect();
  }
}

generateProviderAliases();
