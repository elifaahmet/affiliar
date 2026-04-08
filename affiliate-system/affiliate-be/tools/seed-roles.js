const connectDB = require("../config/db");
const Role = require("../models/Role");

const roles = [
  { roleName: "operator", permissions: [] },
  { roleName: "affiliate", permissions: [] },
];

const run = async () => {
  await connectDB();

  for (const r of roles) {
    const doc = await Role.findOneAndUpdate(
      { roleName: r.roleName },
      r,
      { upsert: true, new: true },
    );
    console.log("Role upserted:", doc.roleName);
  }

  process.exit(0);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
