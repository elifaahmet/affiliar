const mongoose = require("mongoose");
require("dotenv").config();
const { logger } = require("../middlewares/logger");

const connectDB = async () => {
  const MONGODB_URI =
    "mongodb://affiliar:affiliar123@localhost:27017/affiliar-db?authSource=admin";
  try {
    await mongoose.connect(MONGODB_URI);
    logger.info("db.connect.success");
  } catch (error) {
    logger.error("db.connect.failed", { error });
    process.exit(1);
  }
};

module.exports = connectDB;
