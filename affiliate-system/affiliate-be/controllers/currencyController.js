const { MSG } = require("../middlewares/log-messages");
const Currency = require("../models/Currency");

const currencyController = {
  getAll: async (req, res) => {
    try {
      const currencies = await Currency.find({
        isDeleted: false,
        type: "fiat",
      }).select("-__v -createdAt -updatedAt -isDeleted");
      return res.json(currencies);
    } catch (error) {
      req.logMsg(
        MSG.CURRENCY_CONTROLLER_ERR,
        { method: "getAll", error },
        "error"
      );
      return res.status(500).json({ error: "Internal Server Error" });
    }
  },
  getById: async (req, res) => {
    try {
      const currency = await Currency.findOne({
        _id: req.params.id,
        isDeleted: false,
        type: "fiat",
      }).select("-__v -createdAt -updatedAt -isDeleted");
      if (!currency) {
        return res.status(404).json({ error: "Currency not found" });
      }
      res.json(currency);
    } catch (error) {
      req.logMsg(
        MSG.CURRENCY_CONTROLLER_ERR,
        { method: "getById", error },
        "error"
      );
      return res.status(500).json({ error: "Internal Server Error" });
    }
  },
  getByGeneratedId: async (req, res) => {
    try {
      const currency = await Currency.findOne({
        id: req.params.id,
        type: "fiat",
        isDeleted: false,
      }).select("-__v -createdAt -updatedAt -isDeleted");
      if (!currency) {
        return res.status(404).json({ error: "Currency not found" });
      }
      res.json(currency);
    } catch (error) {
      req.logMsg(
        MSG.CURRENCY_CONTROLLER_ERR,
        { method: "getByGeneratedId", error },
        "error"
      );
      return res.status(500).json({ error: "Internal Server Error" });
    }
  },
};

module.exports = currencyController;
