const { default: mongoose } = require("mongoose");
// shortcut will be code

const currencySchema = new mongoose.Schema(
  {
    name: String,
    code: {
      type: String,
    },
    symbol: {
      type: String,
      // enum: ["$", "€", "¥", "£", "A$", "C$", "CHF", "¥", "s#"],
      required: true,
    },
    type: {
      type: String,
      enum: ["fiat", "crypto"],
      required: true,
      lowercase: true,
      trim: true,
      default: "fiat",
    },

    fixedValueCount: {
      type: Number,
      required: true,
      default: 2,
      min: 0,
      max: 8,
    },
    id: {
      type: Number,
      unique: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Currency", currencySchema);
