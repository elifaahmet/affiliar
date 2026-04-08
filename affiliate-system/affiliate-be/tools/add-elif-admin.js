const bcrypt = require("bcryptjs");
const connectDB = require("../config/db");
const User = require("../models/User");

const run = async () => {
  await connectDB();

  const hashedPassword = await bcrypt.hash("1234567", 10);

  const user = await User.findOneAndUpdate(
    { email: "elif@pixupplay.com" },
    {
      email: "elif@pixupplay.com",
      username: "elif",
      name: "Elif",
      role: "operator",
      password: hashedPassword,
      status: "active",
      isDeleted: false,
    },
    { upsert: true, new: true },
  );

  console.log("User created/updated:", user.email, user.role);
  process.exit(0);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
