const getNextSequence = require("../middlewares/counterAdder");
const { MSG } = require("../middlewares/log-messages");
const User = require("../models/User");
const Role = require("../models/Role");
const bcrypt = require("bcryptjs");
const { buildDateRange } = require("../utils/dateRange");

const adminUserController = {
  getOptions: async (req, res) => {
    try {
      const roles = await Role.find({ isDeleted: false })
        .select("roleName -_id")
        .lean();
      const statuses = User.schema.path("status").enumValues;

      return res.json({
        roles: roles.map((r) => r.roleName),
        statuses,
      });
    } catch (error) {
      req.logMsg(MSG.ADMIN_GET_OPTIONS_ERR, { error }, "error");
      return res.status(500).json({ error: "Internal Server Error" });
    }
  },

  getAll: async (req, res) => {
    try {
      const { userId, username, email, status, role, startDate, endDate } =
        req.query;
      const matchStage = { isDeleted: false };

      if (userId) {
        if (!isNaN(userId)) {
          matchStage.id = parseInt(userId);
        } else {
          matchStage._id = userId;
        }
      }
      if (username) matchStage.username = username;
      if (email) matchStage.email = email;
      if (status) matchStage.status = status;
      if (role) matchStage.role = role;
      if (startDate || endDate) {
        const { start, end, error } = buildDateRange({
          startDate,
          endDate,
          tz: req.query.tz,
        });
        if (error) {
          return res.status(400).json({ success: false, message: error });
        }
        matchStage.lastLogin = {};
        if (start) matchStage.lastLogin.$gte = start;
        if (end) matchStage.lastLogin.$lte = end;
      }

      const pipeline = [
        { $match: matchStage },
        { $project: { password: 0, __v: 0 } },
      ];

      const adminUsers = await User.aggregate(pipeline);
      return res.json(adminUsers);
    } catch (error) {
      req.logMsg(MSG.ADMIN_GET_ALL_ERR, { error }, "error");
      return res.status(500).json({ error: "Internal Server Error" });
    }
  },

  getById: async (req, res) => {
    try {
      const adminUser = await User.findOne({
        _id: req.params.id,
        isDeleted: false,
      }).select("-password -__v");
      if (!adminUser) {
        return res.status(404).json({ error: "Admin user not found" });
      }
      res.json(adminUser);
    } catch (error) {
      req.logMsg(MSG.ADMIN_GET_ERR, { error, id: req.params.id }, "error");
      return res.status(500).json({ error: "Internal Server Error" });
    }
  },
  getByGeneratedId: async (req, res) => {
    try {
      const adminUser = await User.findOne({
        id: req.params.id,
        isDeleted: false,
      }).select("-password -__v");
      if (!adminUser) {
        return res.status(404).json({ error: "Admin user not found" });
      }
      res.json(adminUser);
    } catch (error) {
      req.logMsg(MSG.ADMIN_GET_ERR, { error, genId: req.params.id }, "error");
      return res.status(500).json({ error: "Internal Server Error" });
    }
  },
  create: async (req, res) => {
    try {
      const { email, username, password } = req.body;
      const [existingByEmail, existingByUsername] = await Promise.all([
        email ? User.findOne({ email }) : null,
        username ? User.findOne({ username }) : null,
      ]);

      if (existingByEmail && !existingByEmail.isDeleted) {
        return res.status(400).json({ error: "Email already in use" });
      }

      const usernameConflict =
        existingByUsername &&
        !existingByUsername.isDeleted &&
        (!existingByEmail ||
          !existingByEmail._id.equals(existingByUsername._id));

      if (usernameConflict) {
        return res.status(400).json({ error: "Username already in use" });
      }

      const reusableDoc =
        existingByEmail?.isDeleted
          ? existingByEmail
          : existingByUsername?.isDeleted
          ? existingByUsername
          : null;

      const hashedPassword = password
        ? await bcrypt.hash(password, 10)
        : reusableDoc?.password;

      if (reusableDoc) {
        reusableDoc.set({
          ...req.body,
          password: hashedPassword,
          isDeleted: false,
        });
        await reusableDoc.save();

        return res
          .status(200)
          .json({ id: reusableDoc.id, restored: true });
      }

      const id = await getNextSequence("User");
      if (!password) {
        return res.status(400).json({ error: "Password is required" });
      }
      const newAdminUser = new User({
        ...req.body,
        password: await bcrypt.hash(password, 10),
        id,
      });
      await newAdminUser.save();

      res.status(201).json({ id: newAdminUser.id });
    } catch (error) {
      req.logMsg(MSG.ADMIN_CREATE_ERR, { error, body: req.body }, "error");
      return res.status(500).json({ error: "Internal Server Error" });
    }
  },

  update: async (req, res) => {
    try {
      const updateData = { ...req.body };

      if (Object.prototype.hasOwnProperty.call(updateData, "password")) {
        if (updateData.password) {
          updateData.password = await bcrypt.hash(updateData.password, 10);
        } else {
          delete updateData.password;
        }
      }

      if (updateData.email) {
        const emailOwner = await User.findOne({
          email: updateData.email,
          _id: { $ne: req.params.id },
          isDeleted: false,
        });
        if (emailOwner) {
          return res.status(400).json({ error: "Email already in use" });
        }
      }

      if (updateData.username) {
        const usernameOwner = await User.findOne({
          username: updateData.username,
          _id: { $ne: req.params.id },
          isDeleted: false,
        });
        if (usernameOwner) {
          return res.status(400).json({ error: "Username already in use" });
        }
      }

      const updatedAdminUser = await User.findOneAndUpdate(
        { _id: req.params.id, isDeleted: false },
        updateData,
        { new: true }
      ).select("-password -__v");
      if (!updatedAdminUser) {
        return res.status(404).json({ error: "Admin user not found" });
      }
      res.json({ id: updatedAdminUser._id });
    } catch (error) {
      req.logMsg(MSG.ADMIN_UPDATE_ERR, { error, id: req.params.id }, "error");
      return res.status(500).json({ error: "Internal Server Error" });
    }
  },

  resetTwoFactor: async (req, res) => {
    try {
      const user = await User.findById(req.params.id);

      if (!user || user.isDeleted) {
        return res.status(404).json({ error: "Admin user not found" });
      }

      user.twoFactorSecret = null;
      user.twoFactorEnabled = false;
      user.twoFactorQrScanned = false;

      await user.save();

      return res.status(200).json({ message: "2FA reset successfully" });
    } catch (error) {
      req.logMsg(
        MSG.ADMIN_RESET_2FA_ERR,
        { error, id: req.params.id },
        "error"
      );
      return res.status(500).json({ error: "Internal Server Error" });
    }
  },

  delete: async (req, res) => {
    try {
      const deletedAdminUser = await User.findOneAndUpdate(
        { _id: req.params.id, isDeleted: false },
        { isDeleted: true },
        { new: true }
      ).select("-password -__v");
      if (!deletedAdminUser) {
        return res.status(404).json({ error: "Admin user not found" });
      }
      res.json({ message: "Admin user deleted successfully" });
    } catch (error) {
      req.logMsg(MSG.ADMIN_DELETE_ERR, { error, id: req.params.id }, "error");
      return res.status(500).json({ error: "Internal Server Error" });
    }
  },
};

module.exports = adminUserController;
