/**
 * Creates a default "Pixup Play" brand for the operator user.
 * Run once: node tools/seed-brand.js
 */
const connectDB = require("../config/db");
const User = require("../models/User");
const Brand = require("../models/Brand");

const run = async () => {
  await connectDB();

  const operatorUser = await User.findOne({ role: "operator", isDeleted: false });
  if (!operatorUser) {
    console.error("No operator user found. Run seed-operator.js first.");
    process.exit(1);
  }

  const brand = await Brand.findOneAndUpdate(
    { operatorId: operatorUser._id, name: "Pixup Play" },
    { operatorId: operatorUser._id, name: "Pixup Play", id: 1 },
    { upsert: true, new: true }
  );

  console.log(`Brand created: "${brand.name}" (id=${brand.id}) for operator ${operatorUser.email}`);
  process.exit(0);
};

run().catch((err) => { console.error(err); process.exit(1); });
