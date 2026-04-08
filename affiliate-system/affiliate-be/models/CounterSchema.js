const mongoose = require("mongoose");

const CounterSchema = new mongoose.Schema({
  model: { type: String, required: true, unique: true },
  seq: { type: Number, default: 1 },
});

const Counter = mongoose.model("counter", CounterSchema);

module.exports = Counter;
