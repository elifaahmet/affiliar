const mongoose = require("mongoose");
require("dotenv").config();
const { logger } = require("../middlewares/logger");

const connectDB = async () => {
  const MONGODB_URI = process.env.MONGODB_URI;
  try {
    await mongoose.connect(MONGODB_URI);
    logger.info("db.connect.success");
  } catch (error) {
    logger.error("db.connect.failed", { error });
    process.exit(1);
  }
};

module.exports = connectDB;
