const ProviderFeeRate = require("../../models/ProviderFeeRate");
const OperatorFinancialSettings = require("../../models/OperatorFinancialSettings");
const { runOnce: runFeesJob } = require("../../jobs/feesDailyJob");

function operatorOnly(req, res) {
  const user = req.affiliateUser;
  if (user.role !== "operator") {
    res.status(403).json({ error: "Operators only" });
    return null;
  }
  if (!user.operatorId) {
    res.status(400).json({ error: "No operator linked to account" });
    return null;
  }
  return user.operatorId;
}

// GET /api/fees/provider-rates
exports.listProviderRates = async (req, res) => {
  const operatorId = operatorOnly(req, res);
  if (!operatorId) return;
  try {
    const rates = await ProviderFeeRate.find({
      operatorId,
      isDeleted: false,
    })
      .sort({ providerName: 1, providerId: 1 })
      .lean();
    res.json({ rates });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PUT /api/fees/provider-rates — upsert a single rate
exports.upsertProviderRate = async (req, res) => {
  const operatorId = operatorOnly(req, res);
  if (!operatorId) return;
  try {
    const { providerId, providerName = "", feePercent } = req.body || {};
    if (!providerId || feePercent == null) {
      return res
        .status(400)
        .json({ error: "providerId and feePercent are required" });
    }
    const pct = Number(feePercent);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      return res
        .status(400)
        .json({ error: "feePercent must be between 0 and 100" });
    }
    const rate = await ProviderFeeRate.findOneAndUpdate(
      { operatorId, providerId },
      {
        $set: {
          operatorId,
          providerId,
          providerName,
          feePercent: pct,
          isDeleted: false,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    res.json({ rate });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// DELETE /api/fees/provider-rates/:providerId
exports.deleteProviderRate = async (req, res) => {
  const operatorId = operatorOnly(req, res);
  if (!operatorId) return;
  try {
    const { providerId } = req.params;
    await ProviderFeeRate.updateOne(
      { operatorId, providerId },
      { $set: { isDeleted: true } },
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/fees/settings
exports.getFinancialSettings = async (req, res) => {
  const operatorId = operatorOnly(req, res);
  if (!operatorId) return;
  try {
    const settings =
      (await OperatorFinancialSettings.findOne({ operatorId }).lean()) || {
        paymentSystemFeePercent: 0,
        jackpotFeePercent: 0,
        casinoTaxPercent: 0,
      };
    res.json({ settings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PUT /api/fees/settings
exports.updateFinancialSettings = async (req, res) => {
  const operatorId = operatorOnly(req, res);
  if (!operatorId) return;
  try {
    const pick = (v) => {
      if (v == null) return undefined;
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > 100) return null;
      return n;
    };
    const payment = pick(req.body?.paymentSystemFeePercent);
    const jackpot = pick(req.body?.jackpotFeePercent);
    const tax = pick(req.body?.casinoTaxPercent);
    if (payment === null || jackpot === null || tax === null) {
      return res
        .status(400)
        .json({ error: "Percentages must be between 0 and 100" });
    }
    const update = {};
    if (payment !== undefined) update.paymentSystemFeePercent = payment;
    if (jackpot !== undefined) update.jackpotFeePercent = jackpot;
    if (tax !== undefined) update.casinoTaxPercent = tax;
    const settings = await OperatorFinancialSettings.findOneAndUpdate(
      { operatorId },
      { $set: { operatorId, ...update } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    res.json({ settings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /api/fees/run — manual trigger (idempotent; writes yesterday's fees)
exports.runNow = async (req, res) => {
  if (!operatorOnly(req, res)) return;
  try {
    await runFeesJob();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
