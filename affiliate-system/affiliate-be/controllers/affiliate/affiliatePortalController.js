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

function affiliateWhere(affiliateUserId, query) {
  const conditions = [
    "tenant_id = {tenantId:String}",
    "affiliate_id = {affiliateId:String}",
  ];
  const params = {
    tenantId:    affiliateUserId.toString(), // tenantId = operatorId stored in User.operatorId
    affiliateId: affiliateUserId.toString(),
  };

  // Overwrite tenantId with the operator's id from the affiliate's profile
  // (set after we resolve operatorId below)

  if (query.from) {
    conditions.push("from_ts >= {fromTs:DateTime}");
    params.fromTs = chDate(query.from);
  }
  if (query.to) {
    conditions.push("from_ts <= {toTs:DateTime}");
    params.toTs = chDate(query.to, true);
  }
  if (query.brandId) {
    conditions.push("brand_id = {brandId:String}");
    params.brandId = query.brandId;
  }
  if (query.campaign) {
    conditions.push("campaign = {campaign:String}");
    params.campaign = query.campaign;
  }

  return { conditions, params };
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
  uniqExact(player_id)                AS playerCount
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
         uniqExact(player_id)                  AS playerCount
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

    const where = conditions.join(" AND ");

    const [summaryRows, byDayRows] = await Promise.all([
      queryRows(
        `SELECT ${AFFILIATE_METRIC_COLS}
         FROM affiliate.activity
         WHERE ${where}`,
        params,
      ),
      queryRows(
        `SELECT
           formatDateTime(from_ts, '%Y-%m-%d', 'UTC') AS date,
           ${AFFILIATE_METRIC_COLS}
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
    });

    // Commission totals from MongoDB
    const commissionAgg = await CommissionReport.aggregate([
      { $match: { affiliateId: affiliate._id } },
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
