const ProviderFeeRate = require("../../models/ProviderFeeRate");
const OperatorFinancialSettings = require("../../models/OperatorFinancialSettings");
const Brand = require("../../models/Brand");
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

// Normalizes an optional brandId from query/body. Empty / "default" means
// operator-wide config (stored as null).
function normalizeBrandId(raw) {
  if (!raw || raw === "default" || raw === "null") return null;
  return raw;
}

// GET /api/fees/brands — dropdown source for the UI
exports.listBrands = async (req, res) => {
  if (!operatorOnly(req, res)) return;
  try {
    // Brand.operatorId is a ref to the operator *user* (not the tenant),
    // so use the session user's _id.
    const brands = await Brand.find({
      operatorId: req.affiliateUser._id,
      enabled: true,
    })
      .select({ _id: 1, name: 1 })
      .sort({ name: 1 })
      .lean();
    res.json({ brands });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/fees/provider-rates?brandId=<id|default>
exports.listProviderRates = async (req, res) => {
  const operatorId = operatorOnly(req, res);
  if (!operatorId) return;
  try {
    const brandId = normalizeBrandId(req.query.brandId);
    const rates = await ProviderFeeRate.find({
      operatorId,
      brandId,
      isDeleted: false,
    })
      .sort({ providerName: 1, providerId: 1 })
      .lean();
    res.json({ rates });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PUT /api/fees/provider-rates — upsert a single rate, brand-optional
exports.upsertProviderRate = async (req, res) => {
  const operatorId = operatorOnly(req, res);
  if (!operatorId) return;
  try {
    const { providerId, providerName = "", feePercent } = req.body || {};
    const brandId = normalizeBrandId(req.body?.brandId);
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
      { operatorId, brandId, providerId },
      {
        $set: {
          operatorId,
          brandId,
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

// DELETE /api/fees/provider-rates/:providerId?brandId=<id|default>
exports.deleteProviderRate = async (req, res) => {
  const operatorId = operatorOnly(req, res);
  if (!operatorId) return;
  try {
    const { providerId } = req.params;
    const brandId = normalizeBrandId(req.query.brandId);
    await ProviderFeeRate.updateOne(
      { operatorId, brandId, providerId },
      { $set: { isDeleted: true } },
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/fees/settings?brandId=<id|default>
exports.getFinancialSettings = async (req, res) => {
  const operatorId = operatorOnly(req, res);
  if (!operatorId) return;
  try {
    const brandId = normalizeBrandId(req.query.brandId);
    const raw =
      (await OperatorFinancialSettings.findOne({ operatorId, brandId }).lean()) || {};
    // Back-fill depositFeePercent from the legacy paymentSystemFeePercent so
    // the FE always sees the split form, even for unmigrated documents.
    const settings = {
      depositFeePercent:
        raw.depositFeePercent ?? raw.paymentSystemFeePercent ?? 0,
      withdrawalFeePercent: raw.withdrawalFeePercent ?? 0,
      jackpotFeePercent:    raw.jackpotFeePercent ?? 0,
      casinoTaxPercent:     raw.casinoTaxPercent ?? 0,
      // Commission-engine defaults. Consumed when a plan leaves the
      // matching field null. Only meaningful for the operator-default
      // scope (brandId = null) today, but stored per-document so brand
      // overrides are possible later.
      defaults: {
        revshareMetric:         raw.defaults?.revshareMetric ?? "ngr",
        ngrIncludesPaymentFees: raw.defaults?.ngrIncludesPaymentFees ?? true,
        depositBasis:           raw.defaults?.depositBasis ?? "gross",
      },
    };
    res.json({ settings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PUT /api/fees/settings — body: { brandId?, depositFeePercent, withdrawalFeePercent, jackpotFeePercent, casinoTaxPercent }
exports.updateFinancialSettings = async (req, res) => {
  const operatorId = operatorOnly(req, res);
  if (!operatorId) return;
  try {
    const brandId = normalizeBrandId(req.body?.brandId);
    const pick = (v) => {
      if (v == null) return undefined;
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > 100) return null;
      return n;
    };
    // Accept the legacy paymentSystemFeePercent as an alias for deposit fee
    // so clients pinned to the old payload keep working during rollout.
    const deposit = pick(
      req.body?.depositFeePercent ?? req.body?.paymentSystemFeePercent,
    );
    const withdrawal = pick(req.body?.withdrawalFeePercent);
    const jackpot = pick(req.body?.jackpotFeePercent);
    const tax = pick(req.body?.casinoTaxPercent);
    if (
      deposit === null ||
      withdrawal === null ||
      jackpot === null ||
      tax === null
    ) {
      return res
        .status(400)
        .json({ error: "Percentages must be between 0 and 100" });
    }
    const update = {};
    if (deposit !== undefined) {
      update.depositFeePercent = deposit;
      // Clear the legacy field so subsequent reads don't fall back to it.
      update.paymentSystemFeePercent = null;
    }
    if (withdrawal !== undefined) update.withdrawalFeePercent = withdrawal;
    if (jackpot !== undefined) update.jackpotFeePercent = jackpot;
    if (tax !== undefined) update.casinoTaxPercent = tax;

    // Commission-engine defaults. Use dotted paths so the nested subdoc's
    // other fields aren't wiped when only one is being updated.
    const defaults = req.body?.defaults;
    if (defaults && typeof defaults === "object") {
      if (defaults.revshareMetric !== undefined) {
        if (!["ngr", "ggr"].includes(defaults.revshareMetric)) {
          return res.status(400).json({ error: "revshareMetric must be 'ngr' or 'ggr'" });
        }
        update["defaults.revshareMetric"] = defaults.revshareMetric;
      }
      if (defaults.ngrIncludesPaymentFees !== undefined) {
        update["defaults.ngrIncludesPaymentFees"] = !!defaults.ngrIncludesPaymentFees;
      }
      if (defaults.depositBasis !== undefined) {
        if (!["gross", "net"].includes(defaults.depositBasis)) {
          return res.status(400).json({ error: "depositBasis must be 'gross' or 'net'" });
        }
        update["defaults.depositBasis"] = defaults.depositBasis;
      }
    }

    const settings = await OperatorFinancialSettings.findOneAndUpdate(
      { operatorId, brandId },
      { $set: { operatorId, brandId, ...update } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    res.json({ settings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /api/fees/run — manual trigger. Body { dayOffset } lets you pick the
// day to recompute: -1 (yesterday, default), 0 (today), -2 (2 days ago).
exports.runNow = async (req, res) => {
  if (!operatorOnly(req, res)) return;
  try {
    const raw = req.body?.dayOffset;
    const offset = Number.isFinite(Number(raw)) ? Number(raw) : -1;
    await runFeesJob({ dayOffset: offset });
    res.json({ ok: true, dayOffset: offset });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
