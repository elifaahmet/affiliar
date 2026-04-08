const connectDB = require("../config/db");
const AffiliateUser = require("../models/AffiliateUser");
const { logger } = require("../middlewares/logger");
let adminusers = [
  {
    email: "test.editor@gmail.com",
    password: "password0",
    role: "editor",
  },
  {
    email: "test.superadmin@gmail.com",
    password: "password1",
    role: "superadmin",
  },
  {
    email: "test.admin@gmail.com",
    password: "password2",
    role: "admin",
  },
  {
    email: "test.creator@gmail.com",
    password: "password3",
    role: "creator",
  },
  {
    email: "test.viewer@gmail.com",
    password: "password4",
    role: "viewer",
  },
];

connectDB();

const seedAdminUsers = async () => {
  try {
    await AffiliateUser.deleteMany();

    await AffiliateUser.insertMany(adminusers);
  } catch (error) {
    logger.error("seed.admin_users.failure", { error });
    process.exit(1);
  }
};

seedAdminUsers();
