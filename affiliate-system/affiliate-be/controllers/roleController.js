const Role = require("../models/Role");
const User = require("../models/User");
const { MSG } = require("../middlewares/log-messages");
const { buildDateRange } = require("../utils/dateRange");

const roleController = {
  getAll: async (req, res) => {
    try {
      const {
        roleName,
        permissionCount,
        userCount,
        permissions,
        startDate,
        endDate,
      } = req.query;

      const matchStage = { isDeleted: false };

      if (roleName) matchStage.roleName = roleName;
      if (permissions) matchStage.permissions = { $in: [permissions] };
      if (startDate || endDate) {
        const { start, end, error } = buildDateRange({
          startDate,
          endDate,
          tz: req.query.tz,
        });
        if (error) {
          return res.status(400).json({ success: false, message: error });
        }
        matchStage.updatedAt = {};
        if (start) matchStage.updatedAt.$gte = start;
        if (end) matchStage.updatedAt.$lte = end;
      }

      let roles = await Role.find(matchStage).lean();

      if (permissionCount) {
        roles = roles.filter(
          (role) => role.permissions.length == permissionCount
        );
      }

      if (userCount) {
        const withUserCounts = await Promise.all(
          roles.map(async (role) => {
            const count = await User.countDocuments({
              role: role.roleName,
              isDeleted: false,
            });
            return { ...role, _userCount: count };
          })
        );
        roles = withUserCounts.filter((r) => r._userCount == userCount);
      }

      const rolesWithUsers = await Promise.all(
        roles.map(async (role) => {
          const users = await User.find({
            role: role.roleName,
            isDeleted: false,
          }).select("_id name email");

          return {
            _id: role._id,
            roleName: role.roleName,
            permissions: role.permissions,
            users,
            updatedAt: role.updatedAt,
          };
        })
      );
      req.logMsg(MSG.ROLE_GETALL_OK, { count: rolesWithUsers.length });
      return res.json(rolesWithUsers);
    } catch (error) {
      req.logMsg(MSG.ROLE_GETALL_ERR, { error }, "error");
      return res.status(500).json({ error: "Internal Server Error" });
    }
  },

  getById: async (req, res) => {
    try {
      const role = await Role.findById(req.params.id);
      if (!role) {
        return res.status(404).json({ error: "Role not found" });
      }
      res.json(role);
    } catch (error) {
      req.logMsg(MSG.ROLE_GETBYID_ERR, { error }, "error");
      return res.status(500).json({ error: "Internal Server Error" });
    }
  },

  create: async (req, res) => {
    try {
      const newRole = new Role({
        ...req.body,
        lastUpdate: new Date(),
      });

      await newRole.save();
      res.status(201).json(newRole);
    } catch (error) {
      req.logMsg(MSG.ROLE_CREATE_ERR, { error }, "error");
      return res.status(500).json({ error: "Internal Server Error" });
    }
  },

  update: async (req, res) => {
    try {
      const updated = await Role.findByIdAndUpdate(
        req.params.id,
        {
          ...req.body,
          lastUpdate: new Date(),
        },
        { new: true }
      );
      if (!updated) {
        return res.status(404).json({ error: "Role not found" });
      }
      res.json(updated);
    } catch (error) {
      req.logMsg(MSG.ROLE_UPDATE_ERR, { error }, "error");
      return res.status(500).json({ error: "Internal Server Error" });
    }
  },

  delete: async (req, res) => {
    try {
      const updated = await Role.findByIdAndUpdate(
        req.params.id,
        { isDeleted: true },
        { new: true }
      );
      if (!updated) {
        return res.status(404).json({ error: "Role not found" });
      }
      res.json({ message: "Role marked as deleted" });
    } catch (error) {
      req.logMsg(MSG.ROLE_DELETE_ERR, { error }, "error");
      return res.status(500).json({ error: "Internal Server Error" });
    }
  },
};

module.exports = roleController;
