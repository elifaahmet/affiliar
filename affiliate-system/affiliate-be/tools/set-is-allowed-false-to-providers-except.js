const { MongoClient } = require("mongodb");
const { logger } = require("../middlewares/logger");

const providerIconMap = {
  "Blueprint Gaming": true,
  "Evolution Gaming": true,
  Ezugi: true,
  Habanero: true,
  "Hacksaw Gaming": true,
  Netent: true,
  pgsoft: true,
  "play'n go": true,
  playtech: true,
  "Pragmatic Play": false,
  Quickspin: true,
  "Red Tiger": true,
  "Relax Gaming": true,
  Rubyplay: true,
  Spinomenal: true,
  Yggdrasil: true,
};

const uri =
  process.env.MONGODB_URI ||
  "mongodb://157.90.66.248:27019,157.90.66.248:27020/pixupplay-db?replicaSet=rsData";

async function updateProviders() {
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db(); // use db("your-db-name") if not in URI
    const collection = db.collection("providers");

    const allProviders = await collection.find({}).toArray();

    const providersToDisable = allProviders.filter(
      (p) => !providerIconMap[p.name]
    );

    const updateOps = providersToDisable.map((p) =>
      collection.updateOne({ _id: p._id }, { $set: { isAllowed: false } })
    );

    const result = await Promise.all(updateOps);
    logger.info("tools.providers.disable_success", {
      updatedProviders: result.length,
    });
  } catch (err) {
    logger.error("tools.providers.disable_failure", { error: err });
  } finally {
    await client.close();
  }
}

updateProviders();
