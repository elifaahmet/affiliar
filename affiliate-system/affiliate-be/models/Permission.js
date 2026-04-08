const mongoose = require("mongoose");

const permissionSchema = new mongoose.Schema(
  {
    resource: { type: String, required: true },
    action: {
      type: String,
      enum: ["view", "create", "edit", "delete", "enable"],
      required: true,
    },
    condition: { type: mongoose.Schema.Types.Mixed, default: true },
    category: { type: String, default: "general" },
    description: { type: String, default: "" },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Permission", permissionSchema);
