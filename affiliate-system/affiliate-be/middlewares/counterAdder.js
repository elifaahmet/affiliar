const Counter = require("../models/CounterSchema");

const getNextSequence = async (modelName) => {
  const counter = await Counter.findOneAndUpdate(
    { model: modelName },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return counter.seq;
};

module.exports = getNextSequence;
