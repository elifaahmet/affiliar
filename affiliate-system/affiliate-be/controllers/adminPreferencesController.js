const { MSG } = require("../middlewares/log-messages");
const User = require("../models/User");

const adminPreferencesController = {
  getShortcuts: async (req, res) => {
    try {
      const user = await User.findById(req.user.sub).lean();
      if (!user) return res.status(404).json({ error: "User not found" });

      const sortedShortcuts = [...user.quickAccessShortcuts].sort(
        (a, b) => a.order - b.order
      );

      return res.status(200).json({ shortcuts: sortedShortcuts });
    } catch (error) {
      req.logMsg(
        MSG.ADMINPREF_GET_SHORTCUTS_ERR,
        { user_id: req.user?.sub, error_message: error.message },
        "error"
      );
      return res.status(500).json({ error: "Internal Server Error" });
    }
  },

  updateShortcuts: async (req, res) => {
    try {
      const { shortcuts } = req.body;

      const isValid =
        Array.isArray(shortcuts) &&
        shortcuts.every(
          (s) => typeof s.key === "string" && typeof s.order === "number"
        );
      if (!isValid) {
        return res.status(400).json({
          error: "Shortcuts must be an array of { key: string, order: number }",
        });
      }

      const updatedUser = await User.findByIdAndUpdate(
        req.user.sub,
        { quickAccessShortcuts: shortcuts },
        { new: true }
      );

      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }

      return res.status(200).json({
        message: "Shortcuts updated successfully",
        shortcuts: updatedUser.quickAccessShortcuts,
      });
    } catch (error) {
      req.logMsg(
        MSG.ADMINPREF_UPDATE_SHORTCUTS_ERR,
        {
          user_id: req.user?.sub,
          error_message: error.message,
        },
        "error"
      );
      return res.status(500).json({ error: "Internal Server Error" });
    }
  },
};

module.exports = adminPreferencesController;
