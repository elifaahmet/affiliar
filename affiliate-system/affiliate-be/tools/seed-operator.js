const connectDB = require("../config/db");
const Operator = require("../models/Operator");
const User = require("../models/User");
const Brand = require("../models/Brand");

const OPERATOR_EMAIL  = "elif@pixupplay.com";
const DEFAULT_BRAND   = "Pixup Play";

const run = async () => {
  await connectDB();

  const operator = await Operator.findOneAndUpdate(
    { id: 1 },
    { id: 1, name: "Pixupplay" },
    { upsert: true, new: true },
  );
  console.log("Operator:", operator.name, operator._id.toString());

  const user = await User.findOneAndUpdate(
    { email: OPERATOR_EMAIL },
    { operatorId: operator._id },
    { new: true },
  );
  if (!user) {
    console.error("Operator user not found:", OPERATOR_EMAIL);
    process.exit(1);
  }
  console.log("User linked:", user.email, "→ operator", operator._id.toString());

  // Every operator must have at least one brand
  const brand = await Brand.findOneAndUpdate(
    { operatorId: operator._id, id: 1 },
    { operatorId: operator._id, id: 1, name: DEFAULT_BRAND },
    { upsert: true, new: true },
  );
  console.log("Default brand:", brand.name, brand._id.toString());

  process.exit(0);
};

run().catch((err) => { console.error(err); process.exit(1); });
