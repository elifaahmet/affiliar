// createAdminUser.js
// Simple script to create an AffiliateUser with a bcrypt-hashed password

require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

// 👉 Adjust this path according to your project structure
// If your schema file is at: ./models/AffiliateUser.js  then this is correct:
const AffiliateUser = require("../models/AffiliateUser");

// Mongo connection string
const MONGO_URI =
  process.env.MONGO_URI ||
  "mongodb://10.20.1.4:27017,10.20.1.4:27018,10.20.1.4:27019/betamericano-db?replicaSet=rsData";

// ✏️ EDIT THESE OR TAKE FROM ENV
const NEW_ADMIN = {
  email: process.env.ADMIN_EMAIL || "admin@example.com",
  username: process.env.ADMIN_USERNAME || "admin",
  name: process.env.ADMIN_NAME || "Admin User",
  role: process.env.ADMIN_ROLE || "superadmin", // or "admin"
  password: process.env.ADMIN_PASSWORD || "ChangeMe123!",
};

async function main() {
  try {
    console.log("🔌 Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI);
    console.log("✅ MongoDB connected");

    // Check if user already exists
    const existing = await AffiliateUser.findOne({
      $or: [{ email: NEW_ADMIN.email }, { username: NEW_ADMIN.username }],
    });

    if (existing) {
      console.log(
        `⚠️ User already exists with email/username: ${existing.email} / ${existing.username}`
      );
      await mongoose.disconnect();
      return;
    }

    // Get next id (max(id) + 1)
    const lastUser = await AffiliateUser.findOne().sort({ id: -1 }).lean();
    const nextId = lastUser?.id ? lastUser.id + 1 : 1;

    // Hash password
    console.log("🔐 Hashing password...");
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(NEW_ADMIN.password, salt);

    const user = new AffiliateUser({
      email: NEW_ADMIN.email,
      username: NEW_ADMIN.username,
      name: NEW_ADMIN.name,
      role: NEW_ADMIN.role,
      id: nextId,
      password: hashedPassword,
    });

    await user.save();
    console.log("🎉 AffiliateUser created successfully:");
    console.log({
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
    });

    await mongoose.disconnect();
    console.log("👋 Disconnected from MongoDB");
  } catch (err) {
    console.error("❌ Error while creating admin user:", err);
    try {
      await mongoose.disconnect();
    } catch (e) {
      // ignore
    }
    process.exit(1);
  }
}

main();
