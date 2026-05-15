"use strict";

const clickhouse       = require("../../config/clickhouse");
const AffiliateProfile = require("../../models/AffiliateProfile");
const CommissionReport = require("../../models/CommissionReport");
const User             = require("../../models/User");
const Brand            = require("../../models/Brand");

async function buildBrandCodes(profile) {
  const brandCodes = profile?.brandCodes ?? [];
  if (brandCodes.length === 0) {
    // Legacy: no per-brand codes — return flat referralCodes with no brand info
    return (profile?.referralCodes ?? []).map((code) => ({
      code,
      brandId:   null,
      brandName: null,
      brandUrl:  null,
    }));
  }
  const brandIds = brandCodes.map((bc) => bc.brandId);
  const brands = await Brand.find({ _id: { $in: brandIds } })
    .select("_id name url")
    .lean();
  const brandMap = new Map(brands.map((b) => [String(b._id), b]));
  return brandCodes.map((bc) => {
    const brand = brandMap.get(String(bc.brandId));
    return {
      code:      bc.code,
      brandId:   String(bc.brandId),
      brandName: brand?.name ?? null,
      brandUrl:  brand?.url  ?? null,
    };
  });
}

// ── helpers ───────────────────────────────────────────────────────────────────

function chDate(dateStr, end = false) {
  return `${dateStr} ${end ? "23:59:59" : "00:00:00"}`;
}

function coerce(row) {
  return Object.fromEntries(
    Object.entries(row).map(([k, v]) => [k, isNaN(Number(v)) ? v : Number(v)])
  );
}

async function queryRows(sql, params) {
  const result = await clickhouse.query({
    query: sql,
    query_params: params,
    format: "JSONEachRow",
  });
  return result.json();
}

const AFFILIATE_METRIC_COLS = `
  SUM(registrations)                  AS registrations,
  SUM(ftd_count)                      AS ftdCount,
  SUM(ftd_sum_cents)                  AS ftdSumCents,
  SUM(deposits_count)                 AS depositsCount,
  SUM(deposits_sum_cents)             AS depositsSumCents,
  SUM(cashouts_count)                 AS cashoutsCount,
  SUM(cashouts_sum_cents)             AS cashoutsSumCents,
  SUM(chargebacks_sum_cents)          AS chargebacksSumCents,
  SUM(bonus_issues_sum_cents)         AS bonusIssuesSumCents,
  SUM(corrections_up_sum_cents)       AS correctionsUpSumCents,
  SUM(corrections_down_sum_cents)     AS correctionsDownSumCents,
  SUM(casino_ggr_cents)               AS ggrCents,
  SUM(casino_ngr_cents)               AS ngrCents,
  SUM(rounds_count)                   AS roundsCount,
  SUM(sb_bets_sum_cents)              AS sbBetsSumCents,
  SUM(sb_wins_sum_cents)              AS sbWinsSumCents,
  SUM(sb_cancelled_bets_sum_cents)    AS sbCancelledBetsSumCents,
  SUM(sb_rejected_bets_sum_cents)     AS sbRejectedBetsSumCents,
  SUM(sb_settled_bets_sum_cents)      AS sbSettledBetsSumCents,
  SUM(sb_ggr_cents)                   AS sbGgrCents,
  SUM(sb_ngr_cents)                   AS sbNgrCents,
  SUM(combined_ngr_cents)             AS combinedNgrCents,
  uniqExactIf(player_id, player_id != '__fees__')                AS playerCount
`.trim();

// ── Provider breakdown ────────────────────────────────────────────────────────

const ProviderFeeRate = require("../../models/ProviderFeeRate");

exports.providers = async (req, res) => {
  try {
    const user = req.affiliateUser;
    if (!["operator", "affiliate"].includes(user.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    if (!user.operatorId) {
      return res.status(400).json({ error: "No operator linked to account" });
    }

    const conditions = ["tenant_id = {tenantId:String}"];
    const params = { tenantId: user.operatorId.toString() };
    if (user.role === "affiliate") {
      conditions.push("affiliate_id = {affiliateId:String}");
      params.affiliateId = user._id.toString();
    }

    const { from, to } = req.query;
    if (from) { conditions.push("from_ts >= {fromTs:DateTime}"); params.fromTs = chDate(from); }
    if (to)   { conditions.push("from_ts <= {toTs:DateTime}");   params.toTs   = chDate(to, true); }
    if (req.query.brandId)  { conditions.push("brand_id = {brandId:String}"); params.brandId = req.query.brandId; }
    const where = conditions.join(" AND ");

    const rows = await queryRows(
      `SELECT
         provider                              AS providerId,
         SUM(bets_sum_cents)                   AS betsSumCents,
         SUM(wins_sum_cents)                   AS winsSumCents,
         SUM(rounds_count)                     AS roundsCount,
         SUM(game_provider_fees_sum_cents)     AS providerFeesSumCents,
         SUM(casino_ggr_cents)                 AS ggrCents,
         SUM(casino_ngr_cents)                 AS ngrCents,
         uniqExactIf(player_id, player_id != '__fees__')                  AS playerCount
       FROM affiliate.activity
       WHERE ${where}
         AND provider != ''
       GROUP BY provider
       ORDER BY ggrCents DESC`,
      params,
    );

    const rates = await ProviderFeeRate.find({
      operatorId: user.operatorId,
      isDeleted: false,
    })
      .select({ providerId: 1, providerName: 1, feePercent: 1, _id: 0 })
      .lean();
    const rateMap = new Map(rates.map((r) => [r.providerId, r]));

    const providers = rows.map((row) => {
      const r = coerce(row);
      const cfg = rateMap.get(r.providerId) || null;
      return {
        ...r,
        providerName: cfg?.providerName || r.providerId,
        feePercent: cfg?.feePercent ?? 0,
      };
    });

    res.json({ providers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── Overview / Dashboard ──────────────────────────────────────────────────────

exports.overview = async (req, res) => {
  try {
    const affiliate = req.affiliateUser;
    if (affiliate.role !== "affiliate") {
      return res.status(403).json({ error: "Affiliates only" });
    }

    // Resolve tenantId (= operator's operatorId)
    const profile = await AffiliateProfile.findOne({ user: affiliate._id }).lean();
    if (!affiliate.operatorId) {
      return res.status(400).json({ error: "Affiliate is not linked to an operator" });
    }

    const tenantId    = affiliate.operatorId.toString();
    const affiliateId = affiliate._id.toString();

    const conditions = [
      "tenant_id   = {tenantId:String}",
      "affiliate_id = {affiliateId:String}",
    ];
    const params = { tenantId, affiliateId };

    const { from, to } = req.query;
    if (from) { conditions.push("from_ts >= {fromTs:DateTime}"); params.fromTs = chDate(from); }
    if (to)   { conditions.push("from_ts <= {toTs:DateTime}");   params.toTs   = chDate(to, true); }
    if (req.query.brandId)  { conditions.push("brand_id = {brandId:String}"); params.brandId = req.query.brandId; }
    if (req.query.campaign) { conditions.push("campaign = {campaign:String}"); params.campaign = req.query.campaign; }
    if (req.query.affiliateCode) {
      conditions.push("affiliate_code = {affiliateCode:String}");
      params.affiliateCode = String(req.query.affiliateCode).toUpperCase();
    }
    if (req.query.subId) {
      conditions.push("sub_id = {subId:String}");
      params.subId = String(req.query.subId);
    }

    // Product scope. Combined NGR is the only "shared" metric that mixes
    // both products in its formula, so scoping rewrites it to just one
    // half. Casino-only / SB-only metric charts already pull from their
    // own columns and aren't affected here.
    const product = String(req.query.product || "all").toLowerCase();
    const combinedNgrExpr =
      product === "casino"     ? "SUM(casino_ngr_cents)"
    : product === "sportsbook" ? "SUM(sb_ngr_cents)"
    :                            "SUM(combined_ngr_cents)";
    const metricCols = AFFILIATE_METRIC_COLS.replace(
      "SUM(combined_ngr_cents)             AS combinedNgrCents",
      `${combinedNgrExpr.padEnd(36)} AS combinedNgrCents`,
    );

    const where = conditions.join(" AND ");

    const [summaryRows, byDayRows] = await Promise.all([
      queryRows(
        `SELECT ${metricCols}
         FROM affiliate.activity
         WHERE ${where}`,
        params,
      ),
      queryRows(
        `SELECT
           formatDateTime(from_ts, '%Y-%m-%d', 'UTC') AS date,
           ${metricCols}
         FROM affiliate.activity
         WHERE ${where}
         GROUP BY date
         ORDER BY date ASC`,
        params,
      ),
    ]);

    const summary = coerce(summaryRows[0] ?? {
      registrations: 0, ftdCount: 0, ftdSumCents: 0,
      depositsCount: 0, depositsSumCents: 0,
      ggrCents: 0, ngrCents: 0, roundsCount: 0, playerCount: 0,
      sbBetsSumCents: 0, sbWinsSumCents: 0, sbCancelledBetsSumCents: 0,
      sbRejectedBetsSumCents: 0, sbSettledBetsSumCents: 0,
      sbGgrCents: 0, sbNgrCents: 0, combinedNgrCents: 0,
    });

    // Commission totals from MongoDB — filtered to reports whose
    // monthly period overlaps the requested date range. Without this
    // the KPI cards never change as the user moves the date filter.
    const commissionMatch = { affiliateId: affiliate._id };
    if (from || to) {
      const fromDate = from ? new Date(`${from}T00:00:00Z`) : null;
      const toDate   = to   ? new Date(`${to}T23:59:59.999Z`) : null;
      commissionMatch.$expr = {
        $and: [
          ...(toDate ? [{
            $lte: [
              { $dateFromParts: { year: "$period.year", month: "$period.month", day: 1, timezone: "UTC" } },
              toDate,
            ],
          }] : []),
          ...(fromDate ? [{
            $gt: [
              { $dateFromParts: { year: "$period.year", month: { $add: ["$period.month", 1] }, day: 1, timezone: "UTC" } },
              fromDate,
            ],
          }] : []),
        ],
      };
    }
    const commissionAgg = await CommissionReport.aggregate([
      { $match: commissionMatch },
      { $group: {
        _id: null,
        totalEarned:  { $sum: "$breakdown.totalCents" },
        totalPaid:    { $sum: { $cond: [{ $eq: ["$status", "paid"] },    "$breakdown.totalCents", 0] } },
        totalPending: { $sum: { $cond: [{ $in:  ["$status", ["draft", "pending_approval"]] }, "$breakdown.totalCents", 0] } },
        totalApproved:{ $sum: { $cond: [{ $eq: ["$status", "approved"] },"$breakdown.totalCents", 0] } },
      }},
    ]);
    const commission = commissionAgg[0] ?? {
      totalEarned: 0, totalPaid: 0, totalPending: 0, totalApproved: 0,
    };

    // Referral codes (per brand)
    const referralCodes = await buildBrandCodes(profile);

    res.json({
      period: { from, to },
      summary,
      byDay: byDayRows.map(coerce),
      commission,
      referralCodes,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── Commission reports (own) ──────────────────────────────────────────────────

exports.commissionReports = async (req, res) => {
  try {
    const affiliate = req.affiliateUser;
    if (affiliate.role !== "affiliate") {
      return res.status(403).json({ error: "Affiliates only" });
    }

    const { page = 1, limit = 24 } = req.query; // 24 months default
    const skip = (Number(page) - 1) * Number(limit);

    const [reports, total] = await Promise.all([
      CommissionReport.find({ affiliateId: affiliate._id })
        .populate("planId", "name type")
        .sort({ "period.year": -1, "period.month": -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      CommissionReport.countDocuments({ affiliateId: affiliate._id }),
    ]);

    res.json({ reports, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── Profile ───────────────────────────────────────────────────────────────────

exports.getProfile = async (req, res) => {
  try {
    const affiliate = req.affiliateUser;
    if (affiliate.role !== "affiliate") {
      return res.status(403).json({ error: "Affiliates only" });
    }

    const profile = await AffiliateProfile.findOne({ user: affiliate._id })
      .populate("commissionPlanId", "name type revshare cpa tiers")
      .lean();

    res.json({
      user: {
        _id:               affiliate._id,
        email:             affiliate.email,
        username:          affiliate.username,
        name:              affiliate.name,
        mobileNumber:      affiliate.mobileNumber,
        mobileCountryCode: affiliate.mobileCountryCode,
        status:            affiliate.status,
      },
      referralCodes:    await buildBrandCodes(profile),
      commissionPlan:   profile?.commissionPlanId ?? null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── Sub-affiliates (own) ──────────────────────────────────────────────────────

exports.subAffiliates = async (req, res) => {
  try {
    const affiliate = req.affiliateUser;
    if (affiliate.role !== "affiliate") {
      return res.status(403).json({ error: "Affiliates only" });
    }

    const subProfiles = await AffiliateProfile.find({
      parentAffiliate: affiliate._id,
    }).lean();

    const userIds = subProfiles.map((p) => p.user);
    const users   = await User.find({ _id: { $in: userIds } })
      .select("username email name status createdAt")
      .lean();

    const userMap = new Map(users.map((u) => [String(u._id), u]));

    // Aggregate commission totals per sub-affiliate
    const commAgg = await CommissionReport.aggregate([
      { $match: { affiliateId: { $in: userIds } } },
      { $group: {
        _id:          "$affiliateId",
        totalCents:   { $sum: "$breakdown.totalCents" },
        paidCents:    { $sum: { $cond: [{ $eq: ["$status", "paid"] }, "$breakdown.totalCents", 0] } },
        reportCount:  { $sum: 1 },
      }},
    ]);
    const commMap = new Map(commAgg.map((c) => [String(c._id), c]));

    const result = subProfiles.map((p) => {
      const user = userMap.get(String(p.user)) ?? {};
      const comm = commMap.get(String(p.user))  ?? { totalCents: 0, paidCents: 0, reportCount: 0 };
      return {
        _id:           String(p.user),
        username:      user.username,
        email:         user.email,
        name:          user.name,
        status:        user.status,
        createdAt:     user.createdAt,
        overrideRate:  p.overrideRate,
        referralCodes: p.referralCodes,
        commission:    {
          totalCents:  comm.totalCents,
          paidCents:   comm.paidCents,
          reportCount: comm.reportCount,
        },
      };
    });

    res.json({ subAffiliates: result, total: result.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const affiliate = req.affiliateUser;
    if (affiliate.role !== "affiliate") {
      return res.status(403).json({ error: "Affiliates only" });
    }

    const { name, mobileNumber, mobileCountryCode } = req.body;

    const updated = await User.findByIdAndUpdate(
      affiliate._id,
      { $set: { name, mobileNumber: mobileNumber || null, mobileCountryCode: mobileCountryCode || null } },
      { new: true, select: "-password -twoFactorSecret" },
    ).lean();

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── Fee details (read-only operator policy) ───────────────────────────────────

const OperatorFinancialSettings = require("../../models/OperatorFinancialSettings");

// GET /api/affiliate-portal/fee-details
// Returns the operator's currently configured fee percentages + the provider
// fee rate list (default + any per-brand overrides) so the affiliate can see
// exactly what's being deducted from GGR on their behalf. Read-only.
exports.feeDetails = async (req, res) => {
  try {
    const affiliate = req.affiliateUser;
    if (affiliate.role !== "affiliate") {
      return res.status(403).json({ error: "Affiliates only" });
    }

    const profile = await AffiliateProfile.findOne({ user: affiliate._id })
      .select("operatorUser")
      .lean();
    if (!profile?.operatorUser) {
      return res.status(404).json({ error: "Affiliate profile not found" });
    }

    // Look up the User to resolve their tenant operator id (Operator._id),
    // since financial settings + provider rates are keyed by it.
    const operatorUser = await User.findById(profile.operatorUser)
      .select("operatorId")
      .lean();
    const operatorId = operatorUser?.operatorId;
    if (!operatorId) {
      return res.status(404).json({ error: "Operator not linked" });
    }

    const [allFinancials, providerRates, brands] = await Promise.all([
      OperatorFinancialSettings.find({ operatorId }).lean(),
      ProviderFeeRate.find({ operatorId, isDeleted: false }).lean(),
      Brand.find({ operatorId: profile.operatorUser, enabled: true })
        .select("_id name")
        .lean(),
    ]);

    const brandMap = new Map(brands.map((b) => [String(b._id), b.name]));
    const defaultSettings =
      allFinancials.find((f) => !f.brandId) || null;
    const brandSettings = allFinancials
      .filter((f) => f.brandId)
      .map((f) => ({
        brandId: String(f.brandId),
        brandName: brandMap.get(String(f.brandId)) || null,
        depositFeePercent:      f.depositFeePercent ?? f.paymentSystemFeePercent ?? null,
        withdrawalFeePercent:   f.withdrawalFeePercent ?? null,
        jackpotFeePercent:      f.jackpotFeePercent ?? null,
        casinoTaxPercent:       f.casinoTaxPercent ?? null,
        sbThirdPartyFeePercent: f.sbThirdPartyFeePercent ?? null,
      }));

    const providers = providerRates.map((r) => ({
      providerId: r.providerId,
      providerName: r.providerName,
      brandId: r.brandId ? String(r.brandId) : null,
      brandName: r.brandId ? brandMap.get(String(r.brandId)) || null : null,
      feePercent: Number(r.feePercent) || 0,
    }));

    return res.json({
      operatorDefaults: defaultSettings && {
        depositFeePercent:      defaultSettings.depositFeePercent ?? defaultSettings.paymentSystemFeePercent ?? null,
        withdrawalFeePercent:   defaultSettings.withdrawalFeePercent ?? null,
        jackpotFeePercent:      defaultSettings.jackpotFeePercent ?? null,
        casinoTaxPercent:       defaultSettings.casinoTaxPercent ?? null,
        sbThirdPartyFeePercent: defaultSettings.sbThirdPartyFeePercent ?? null,
      },
      brandOverrides: brandSettings,
      providerRates: providers,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── Self-service referral code generation ─────────────────────────────────────

// Same character set the operator-side createAffiliate flow uses — drops
// look-alike chars (0/O, 1/I) so codes are easy to read off a screen.
function generateAffiliateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

async function uniqueAffiliateCode() {
  let code;
  for (let i = 0; i < 10; i++) {
    code = generateAffiliateCode();
    const collision = await AffiliateProfile.findOne({ referralCodes: code }).select("_id").lean();
    if (!collision) return code;
  }
  throw new Error("Failed to generate a unique code after 10 attempts");
}

// POST /affiliate-portal/referral-codes — body: { brandId }
// Lets the affiliate generate an extra brand-scoped code from the marketing
// tools page. The new code is pushed onto both `brandCodes` (per-brand
// pairing the FE renders) and the legacy flat `referralCodes` array (kept
// in sync so consumer-side lookups by code still resolve).
exports.generateReferralCode = async (req, res) => {
  try {
    const affiliate = req.affiliateUser;
    if (affiliate.role !== "affiliate") {
      return res.status(403).json({ error: "Affiliates only" });
    }

    const { brandId } = req.body || {};
    if (!brandId) {
      return res.status(400).json({ error: "brandId is required" });
    }

    const profile = await AffiliateProfile.findOne({ user: affiliate._id });
    if (!profile) {
      return res.status(404).json({ error: "Affiliate profile not found" });
    }

    // Only allow generating for brands the operator owns; defends against
    // an affiliate POSTing a foreign brand id.
    const brand = await Brand.findOne({
      _id: brandId,
      operatorId: profile.operatorUser,
      enabled: true,
    })
      .select("_id name url")
      .lean();
    if (!brand) {
      return res.status(403).json({ error: "Brand not available for this affiliate" });
    }

    const code = await uniqueAffiliateCode();

    profile.brandCodes = profile.brandCodes || [];
    profile.brandCodes.push({ code, brandId: brand._id });
    profile.referralCodes = profile.referralCodes || [];
    profile.referralCodes.push(code);
    await profile.save();

    return res.status(201).json({
      referralCodes: await buildBrandCodes(profile),
      generated: {
        code,
        brandId: String(brand._id),
        brandName: brand.name,
        brandUrl: brand.url,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
