const connectDB = require("../config/db");
const Role = require("../models/Role");
const Permission = require("../models/Permission");
const { logger } = require("../middlewares/logger");
const { ROLES } = require("../utils/constants");

const seedDefaultRoles = async () => {
  try {
    await connectDB();

    logger.info("seed.roles.clearing");
    await Role.deleteMany({});

    const allPermissions = await Permission.find().lean();

    const getPermissionsByActions = (actions) => {
      return allPermissions
        .filter((p) => actions.includes(p.action))
        .map((p) => `${p.resource}.${p.action}`);
    };
    const getPermissionsByResourcePrefix = (prefixes) => {
      return allPermissions
        .filter((p) => prefixes.some((prefix) => p.resource.startsWith(prefix)))
        .map((p) => `${p.resource}.${p.action}`);
    };

    const roles = [
      {
        roleName: ROLES.SUPERADMIN,
        permissions: allPermissions.map((p) => `${p.resource}.${p.action}`),
      },
      {
        roleName: ROLES.ADMIN,
        permissions: allPermissions.map((p) => `${p.resource}.${p.action}`),
      },
      {
        roleName: ROLES.VIEWER,
        permissions: getPermissionsByActions(["view"]),
      },
      {
        roleName: ROLES.EDITOR,
        permissions: getPermissionsByActions(["view", "edit", "create"]),
      },
      {
        roleName: ROLES.CREATOR,
        permissions: getPermissionsByActions(["view", "create"]),
      },
      {
        roleName: ROLES.AFFILIATE,
        permissions: allPermissions
          .filter(
            (p) => p.resource.startsWith("bonuses") && p.action === "view",
          )
          .map((p) => `${p.resource}.${p.action}`),
      },
    ];

    for (const role of roles) {
      await Role.create(role);
      logger.info("seed.roles.created", { role: role.roleName });
    }

    logger.info("seed.roles.success");
    process.exit(0);
  } catch (err) {
    logger.error("seed.roles.failure", { error: err });
    process.exit(1);
  }
};

seedDefaultRoles();
