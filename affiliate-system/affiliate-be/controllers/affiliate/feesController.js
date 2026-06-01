const ProviderFeeRate = require("../../models/ProviderFeeRate");
const OperatorFinancialSettings = require("../../models/OperatorFinancialSettings");
const Brand = require("../../models/Brand");
const { runOnce: runFeesJob } = require("../../jobs/feesDailyJob");
const {
  resolveOperatorPlan, planError,
} = require("../../middlewares/planGuard");
const { firstPlanWith } = require("../../utils/planLimits");
const {
  saveFinancialsVersion,
  saveProviderRateVersion,
} = require("../../utils/feeVersioning");

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
    // Brand.operatorId references the Operator tenant (not the owner user),
    // so scope by the session user's operatorId.
    const brands = await Brand.find({
      operatorId: req.affiliateUser.operatorId,
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
//
// Returns the *currently active* versions only — historical/superseded
// rows have effectiveUntil set and aren't relevant to the UI. The
// versioning history surface lives on a separate endpoint.
exports.listProviderRates = async (req, res) => {
  const operatorId = operatorOnly(req, res);
  if (!operatorId) return;
  try {
    const brandId = normalizeBrandId(req.query.brandId);
    const rates = await ProviderFeeRate.find({
      operatorId,
      brandId,
      isDeleted: false,
      effectiveUntil: null,
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
    const rate = await saveProviderRateVersion({
      operatorId,
      brandId,
      providerId,
      providerName,
      feePercent: pct,
      isDeleted: false,
    });
    res.json({ rate });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /api/fees/provider-rates/bulk
// Body: { brandId, rates: [{ providerId, providerName, feePercent }, ...] }
// Upserts every row in a single request. Same validation rules as the single
// upsert; the first invalid row aborts the whole batch so the operator
// doesn't end up with a half-applied import.
exports.bulkUpsertProviderRates = async (req, res) => {
  const operatorId = operatorOnly(req, res);
  if (!operatorId) return;
  try {
    const brandId = normalizeBrandId(req.body?.brandId);
    const raw = Array.isArray(req.body?.rates) ? req.body.rates : null;
    if (!raw || raw.length === 0) {
      return res.status(400).json({ error: "rates array is required" });
    }

    // Validate up front. Reject the whole payload on the first error so
    // the caller can fix and retry rather than chase partial writes.
    const cleaned = [];
    for (let i = 0; i < raw.length; i++) {
      const r = raw[i] || {};
      const providerId = String(r.providerId || "").trim();
      const providerName = String(r.providerName || "").trim();
      const pct = Number(r.feePercent);
      if (!providerId) {
        return res.status(400).json({ error: `row ${i + 1}: providerId is required` });
      }
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
        return res.status(400).json({ error: `row ${i + 1}: feePercent must be 0–100` });
      }
      cleaned.push({ providerId, providerName, feePercent: pct });
    }

    // Versioned writes don't lend themselves to bulkWrite cleanly (each
    // row needs an effectiveUntil close on the previous version), so we
    // loop serially. The cron's data volume is per-day so this is fine
    // — bulk imports are CSV-scale (~tens to low hundreds of providers).
    let inserted = 0;
    for (const r of cleaned) {
      await saveProviderRateVersion({
        operatorId,
        brandId,
        providerId:   r.providerId,
        providerName: r.providerName,
        feePercent:   r.feePercent,
        isDeleted:    false,
      });
      inserted++;
    }
    res.json({
      imported: cleaned.length,
      inserted,
      updated: 0, // each save creates a new active version; "updated" is meaningless under versioning
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// DELETE /api/fees/provider-rates/:providerId?brandId=<id|default>
//
// Soft-delete by writing a new version with isDeleted: true. The
// historical rows stay readable (so a re-run of a date BEFORE the delete
// still finds the rate); from `now` forward the rate disappears from the
// UI + the as-of resolver.
exports.deleteProviderRate = async (req, res) => {
  const operatorId = operatorOnly(req, res);
  if (!operatorId) return;
  try {
    const { providerId } = req.params;
    const brandId = normalizeBrandId(req.query.brandId);
    const current = await ProviderFeeRate.findOne({
      operatorId, brandId, providerId, effectiveUntil: null,
    }).lean();
    if (!current) return res.json({ ok: true }); // already gone
    await saveProviderRateVersion({
      operatorId,
      brandId,
      providerId,
      providerName: current.providerName,
      feePercent:   current.feePercent,
      isDeleted:    true,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/fees/settings?brandId=<id|default>
//
// Returns the currently active version only. Historical versions are
// hidden — exposed through a dedicated /fees/settings/history endpoint.
exports.getFinancialSettings = async (req, res) => {
  const operatorId = operatorOnly(req, res);
  if (!operatorId) return;
  try {
    const brandId = normalizeBrandId(req.query.brandId);
    const raw =
      (await OperatorFinancialSettings.findOne({
        operatorId, brandId, effectiveUntil: null,
      }).lean()) || {};
    // Back-fill depositFeePercent from the legacy paymentSystemFeePercent so
    // the FE always sees the split form, even for unmigrated documents.
    const settings = {
      depositFeePercent:
        raw.depositFeePercent ?? raw.paymentSystemFeePercent ?? 0,
      withdrawalFeePercent:   raw.withdrawalFeePercent ?? 0,
      jackpotFeePercent:      raw.jackpotFeePercent ?? 0,
      casinoTaxPercent:       raw.casinoTaxPercent ?? 0,
      sbThirdPartyFeePercent:  raw.sbThirdPartyFeePercent ?? 0,
      customNgrFeePercent:     raw.customNgrFeePercent ?? 0,
      customDepositFeePercent: raw.customDepositFeePercent ?? 0,
      alwaysDeductCustomFees:  !!raw.alwaysDeductCustomFees,
      // Commission-engine defaults. Consumed when a plan leaves the
      // matching field null. Only meaningful for the operator-default
      // scope (brandId = null) today, but stored per-document so brand
      // overrides are possible later.
      defaults: {
        revshareMetric:         raw.defaults?.revshareMetric ?? "ngr",
        ngrIncludesPaymentFees: raw.defaults?.ngrIncludesPaymentFees ?? true,
        depositBasis:           raw.defaults?.depositBasis ?? "gross",
        // CPA qualification gate defaults. Null ≡ not enforced.
        minDepositCents:        raw.defaults?.minDepositCents ?? null,
        minWagerMultiple:       raw.defaults?.minWagerMultiple ?? null,
        minWagerCents:          raw.defaults?.minWagerCents ?? null,
        holdDays:               raw.defaults?.holdDays ?? null,
        minCashRetentionCents:  raw.defaults?.minCashRetentionCents ?? null,
        minKycLevel:            raw.defaults?.minKycLevel ?? null,
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
    // Body-conditional plan gates: the Operator-wide fees, deposit/withdrawal,
    // jackpot, tax, sb-third-party rates and the commission defaults are
    // open to every plan. Only the **new** capability fields (Custom NGR /
    // Custom Deposit %, and the minKycLevel CPA gate) are plan-restricted —
    // reject them at the controller layer so the rest of the payload still
    // applies on lower tiers.
    const wantsCustomFees =
      req.body?.customNgrFeePercent !== undefined ||
      req.body?.customDepositFeePercent !== undefined;
    const wantsKycGate =
      req.body?.defaults && req.body.defaults.minKycLevel !== undefined;
    if (wantsCustomFees || wantsKycGate) {
      const resolved = await resolveOperatorPlan(req);
      if (resolved) {
        const { plan, planKey } = resolved;
        if (wantsCustomFees && !plan.customFees) {
          return res.status(403).json(
            planError(
              `Custom NGR / Custom Deposit deductions are not available on the ${plan.name} plan.`,
              planKey,
              firstPlanWith((p) => p.customFees),
            ),
          );
        }
        if (wantsKycGate && !plan.kycGate) {
          return res.status(403).json(
            planError(
              `The minKycLevel CPA gate is not available on the ${plan.name} plan.`,
              planKey,
              firstPlanWith((p) => p.kycGate),
            ),
          );
        }
      }
    }

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
    const sbThirdParty = pick(req.body?.sbThirdPartyFeePercent);
    const customNgr = pick(req.body?.customNgrFeePercent);
    const customDeposit = pick(req.body?.customDepositFeePercent);
    if (
      deposit === null ||
      withdrawal === null ||
      jackpot === null ||
      tax === null ||
      sbThirdParty === null ||
      customNgr === null ||
      customDeposit === null
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
    if (sbThirdParty !== undefined) update.sbThirdPartyFeePercent = sbThirdParty;
    if (customNgr !== undefined) update.customNgrFeePercent = customNgr;
    if (customDeposit !== undefined) update.customDepositFeePercent = customDeposit;
    if (req.body?.alwaysDeductCustomFees !== undefined) {
      update.alwaysDeductCustomFees = !!req.body.alwaysDeductCustomFees;
    }

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

      // Gate defaults — null (or missing) disables the gate. Any non-null
      // value must be a non-negative number.
      const gateKeys = [
        "minDepositCents",
        "minWagerMultiple",
        "minWagerCents",
        "holdDays",
        "minCashRetentionCents",
      ];
      for (const k of gateKeys) {
        if (defaults[k] === undefined) continue;
        if (defaults[k] === null) {
          update[`defaults.${k}`] = null;
          continue;
        }
        const n = Number(defaults[k]);
        if (!Number.isFinite(n) || n < 0) {
          return res.status(400).json({ error: `${k} must be a non-negative number or null` });
        }
        update[`defaults.${k}`] = n;
      }

      // minKycLevel is bounded 0..3 (integer) — separate from the open-ended
      // numeric gates above. null = gate disabled.
      if (defaults.minKycLevel !== undefined) {
        if (defaults.minKycLevel === null) {
          update["defaults.minKycLevel"] = null;
        } else {
          const k = Number(defaults.minKycLevel);
          if (!Number.isInteger(k) || k < 0 || k > 3) {
            return res
              .status(400)
              .json({ error: "minKycLevel must be an integer 0–3 or null" });
          }
          update["defaults.minKycLevel"] = k;
        }
      }
    }

    const settings = await saveFinancialsVersion({
      operatorId,
      brandId,
      patch: update,
    });
    res.json({ settings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /api/fees/run — manual trigger.
//
// Two shapes accepted:
//   { dayOffset: number }                 — legacy, picks a single day
//                                            relative to today. Uses the
//                                            historical fee version that
//                                            was active on that day.
//   { dateFrom: ISO, dateTo: ISO,         — date range (inclusive). Each
//     applyCurrentFees: boolean }           day in the range gets re-run.
//                                            applyCurrentFees=true forces
//                                            today's active fees onto every
//                                            day (deliberate retroactive
//                                            recalc); false (default) honors
//                                            each day's historical version.
exports.runNow = async (req, res) => {
  if (!operatorOnly(req, res)) return;
  try {
    const { dateFrom, dateTo, applyCurrentFees = false, dayOffset } = req.body || {};

    // Date-range mode.
    if (dateFrom || dateTo) {
      const from = new Date(dateFrom);
      const to   = new Date(dateTo || dateFrom);
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
        return res.status(400).json({ error: "dateFrom and dateTo must be ISO dates" });
      }
      if (from > to) {
        return res.status(400).json({ error: "dateFrom must be <= dateTo" });
      }
      // Cap the loop at 90 days so a typo doesn't kick off a year-long run
      // from the UI. Operator can chunk if they need more.
      const ONE_DAY = 24 * 60 * 60 * 1000;
      const dayCount = Math.floor((to - from) / ONE_DAY) + 1;
      if (dayCount > 90) {
        return res.status(400).json({
          error: "Date range too large (max 90 days). Run in chunks.",
        });
      }

      const days = [];
      // Walk yyyy-mm-dd in UTC.
      const cursor = new Date(Date.UTC(
        from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(),
      ));
      const end = new Date(Date.UTC(
        to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate(),
      ));
      while (cursor <= end) {
        await runFeesJob({
          forDate: new Date(cursor),
          applyCurrentFees: !!applyCurrentFees,
        });
        days.push(cursor.toISOString().slice(0, 10));
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
      return res.json({
        ok: true,
        mode: "range",
        applyCurrentFees: !!applyCurrentFees,
        days,
      });
    }

    // Legacy single-day mode.
    const offset = Number.isFinite(Number(dayOffset)) ? Number(dayOffset) : -1;
    await runFeesJob({ dayOffset: offset });
    res.json({ ok: true, mode: "offset", dayOffset: offset });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/fees/settings/history?brandId=<id|default>&limit=
//
// Returns the version chain (most recent first) so the FE can show "what
// the fee config looked like on date X" alongside the manual-run picker.
exports.listFinancialHistory = async (req, res) => {
  const operatorId = operatorOnly(req, res);
  if (!operatorId) return;
  try {
    const brandId = normalizeBrandId(req.query.brandId);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const versions = await OperatorFinancialSettings.find({ operatorId, brandId })
      .sort({ effectiveFrom: -1 })
      .limit(limit)
      .lean();
    res.json({ versions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/fees/provider-rates/history?brandId=<id|default>&providerId=&limit=
exports.listProviderRateHistory = async (req, res) => {
  const operatorId = operatorOnly(req, res);
  if (!operatorId) return;
  try {
    const brandId = normalizeBrandId(req.query.brandId);
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const match = { operatorId, brandId };
    if (req.query.providerId) match.providerId = String(req.query.providerId);
    const versions = await ProviderFeeRate.find(match)
      .sort({ effectiveFrom: -1 })
      .limit(limit)
      .lean();
    res.json({ versions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
