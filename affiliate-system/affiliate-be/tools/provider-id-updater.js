const { MongoClient, ObjectId } = require("mongodb");
const { logger } = require("../middlewares/logger");

const uri =
  "mongodb://157.90.66.248:27019,157.90.66.248:27020/pixupplay-db?replicaSet=rsData";
const dbName = "pixupplay-db";

const run = async () => {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(dbName);

    // 1. Get all providers with id and _id
    const providers = await db
      .collection("providers")
      .find({}, { projection: { _id: 1, id: 1 } })
      .toArray();
    const providerMap = new Map(providers.map((p) => [p.id, p._id]));

    // 2. Build bulk operations
    const bulkOps = [];

    for (const [intId, objId] of providerMap.entries()) {
      bulkOps.push({
        updateMany: {
          filter: { providerId: intId },
          update: {
            $set: {
              providerId: objId,
              updatedAt: new Date(),
            },
          },
        },
      });
    }

    // 3. Execute bulk update
    if (bulkOps.length > 0) {
      const result = await db.collection("gamesV2").bulkWrite(bulkOps);
      logger.info("tools.provider_id_update.success", {
        modifiedCount: result.modifiedCount,
      });
    } else {
      logger.info("tools.provider_id_update.no_changes");
    }
  } catch (err) {
    logger.error("tools.provider_id_update.error", { error: err });
  } finally {
    await client.close();
  }
};

run();
