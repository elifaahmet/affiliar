"use strict";

const crypto             = require("crypto");
const mongoose           = require("mongoose");
const clickhouse         = require("../../config/clickhouse");
const AffiliateProfile   = require("../../models/AffiliateProfile");
const CommissionReport   = require("../../models/CommissionReport");
const SubAffiliatePayout = require("../../models/SubAffiliatePayout");
const AffiliatePayout    = require("../../models/AffiliatePayout");
const User               = require("../../models/User");
const Brand              = require("../../models/Brand");
const { getDescendantIds } = require("../../utils/affiliateHierarchy");
const { computeBalance } = require("../../utils/affiliateBalance");
const { logger }         = require("../../middlewares/logger");

// TRC20 wallet addresses are 34 chars, start with "T", base58 alphabet
// (excludes 0 O I l). This isn't a checksum verification — that lives at the
// payment provider side. It just catches obvious typos at the form layer.
const TRC20_RE = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;

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
  SUM(casino_ggr_cents + sb_ggr_cents) AS combinedGgrCents,
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

    // Subtree by default: own players plus every descendant's. Drill-down
    // via ?forAffiliateId narrows to a single affiliate in the subtree —
    // ownership-checked so callers can't peek outside their tree.
    const subtreeIds = [affiliateId, ...await getDescendantIds(affiliate._id)];
    let affiliateIds = subtreeIds;
    let scopedAffiliateId = null; // set when the dashboard is narrowed to one affiliate
    if (req.query.forAffiliateId) {
      const requested = String(req.query.forAffiliateId);
      if (!subtreeIds.includes(requested)) {
        return res.status(403).json({ error: "Affiliate is not in your subtree" });
      }
      affiliateIds = [requested];
      scopedAffiliateId = requested;
    }

    const conditions = [
      "tenant_id    = {tenantId:String}",
      "affiliate_id IN {affiliateIds:Array(String)}",
    ];
    const params = { tenantId, affiliateIds };

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
      sbBetsSumCents: 0, sbWinsSumCents: 0, sbCancelledBetsSumCents: 0,
      sbRejectedBetsSumCents: 0, sbSettledBetsSumCents: 0,
      sbGgrCents: 0, sbNgrCents: 0, combinedNgrCents: 0,
    });

    // Commission totals from MongoDB — filtered to reports whose
    // monthly period overlaps the requested date range. Without this
    // the KPI cards never change as the user moves the date filter.
    //
    // Commission scope mirrors the activity scope above. Default
    // ("My network") shows the affiliate's full earnings: their own report
    // (direct + override) plus income earned as someone's sub. When the
    // dashboard is narrowed to a single affiliate (?forAffiliateId) the
    // cards must narrow too — otherwise "Just my players" still shows
    // subtree-wide override income. Scoped, we count only the commission
    // generated by *that* affiliate's own players, i.e. directCents
    // (overrideCents is earned from their sub-affiliates — not own players).
    // NOTE: aggregate $match does NOT cast strings to ObjectId, so a scoped
    // id coming from the query string must be converted explicitly — otherwise
    // the match silently returns nothing and "Just my players" shows €0.
    const commissionAffiliateId = scopedAffiliateId
      ? new mongoose.Types.ObjectId(scopedAffiliateId)
      : affiliate._id;
    const earnedField = scopedAffiliateId ? "$breakdown.directCents" : "$breakdown.totalCents";
    const commissionMatch = { affiliateId: commissionAffiliateId };
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
        totalEarned:  { $sum: earnedField },
        totalPaid:    { $sum: { $cond: [{ $eq: ["$status", "paid"] },    earnedField, 0] } },
        totalPending: { $sum: { $cond: [{ $in:  ["$status", ["draft", "pending_approval"]] }, earnedField, 0] } },
        totalApproved:{ $sum: { $cond: [{ $eq: ["$status", "approved"] },earnedField, 0] } },
      }},
    ]);
    const reportCommission = commissionAgg[0] ?? {
      totalEarned: 0, totalPaid: 0, totalPending: 0, totalApproved: 0,
    };

    // Sub-affiliates have no CommissionReport — their income is the sum of
    // SubAffiliatePayouts they're the SUB of. Top-level affiliates can also
    // be subs of someone (in unbounded depth, only true root is the operator
    // edge), but our model has the operator as the only payer of top-level —
    // so SubAffiliatePayout.subId would only ever match a non-top-level
    // affiliate. Same date-window match as reports.
    const subPayoutMatch = { subId: commissionAffiliateId };
    if (from || to) {
      subPayoutMatch.$expr = commissionMatch.$expr;
    }
    const subPayoutAgg = await SubAffiliatePayout.aggregate([
      { $match: subPayoutMatch },
      { $group: {
        _id: null,
        totalEarned:  { $sum: "$payableCents" },
        totalPaid:    { $sum: { $cond: [{ $eq: ["$status", "paid"] },  "$payableCents", 0] } },
        totalPending: { $sum: { $cond: [{ $eq: ["$status", "draft"] }, "$payableCents", 0] } },
      }},
    ]);
    const subIncome = subPayoutAgg[0] ?? {
      totalEarned: 0, totalPaid: 0, totalPending: 0,
    };

    const commission = {
      totalEarned:   reportCommission.totalEarned   + subIncome.totalEarned,
      totalPaid:     reportCommission.totalPaid     + subIncome.totalPaid,
      totalPending:  reportCommission.totalPending  + subIncome.totalPending,
      totalApproved: reportCommission.totalApproved, // sub payouts have no approved state
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
        _id:                affiliate._id,
        email:              affiliate.email,
        username:           affiliate.username,
        name:               affiliate.name,
        mobileNumber:       affiliate.mobileNumber,
        mobileCountryCode:  affiliate.mobileCountryCode,
        website:            affiliate.website || null,
        status:             affiliate.status,
        payoutAddress:      affiliate.payoutAddress || null,
        payoutNetwork:      affiliate.payoutNetwork || "TRC20",
        payoutAddressSetAt: affiliate.payoutAddressSetAt || null,
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

    // Full subtree (descendants at any depth). The caller's own row is
    // omitted; each row carries `parentAffiliate` so the client can rebuild
    // the tree.
    const descendantIds = await getDescendantIds(affiliate._id);
    if (descendantIds.length === 0) {
      return res.json({ subAffiliates: [], total: 0 });
    }

    const subProfiles = await AffiliateProfile.find({
      user: { $in: descendantIds },
    }).lean();

    const userIds = subProfiles.map((p) => p.user);
    const users   = await User.find({ _id: { $in: userIds } })
      .select("username email name status createdAt")
      .lean();
    const userMap = new Map(users.map((u) => [String(u._id), u]));

    // After Phase 2 sub-affiliates have no CommissionReport — their earnings
    // are SubAffiliatePayouts received from their parent. Aggregate those.
    const commAgg = await SubAffiliatePayout.aggregate([
      { $match: { subId: { $in: userIds } } },
      { $group: {
        _id:          "$subId",
        totalCents:   { $sum: "$payableCents" },
        paidCents:    { $sum: { $cond: [{ $eq: ["$status", "paid"] }, "$payableCents", 0] } },
        reportCount:  { $sum: 1 },
      }},
    ]);
    const commMap = new Map(commAgg.map((c) => [String(c._id), c]));

    const result = subProfiles.map((p) => {
      const user = userMap.get(String(p.user)) ?? {};
      const comm = commMap.get(String(p.user))  ?? { totalCents: 0, paidCents: 0, reportCount: 0 };
      return {
        _id:             String(p.user),
        username:        user.username,
        email:           user.email,
        name:            user.name,
        status:          user.status,
        createdAt:       user.createdAt,
        parentAffiliate: p.parentAffiliate ? String(p.parentAffiliate) : null,
        subPlan:         normalizeSubPlan(p.subPlan),
        referralCodes:   p.referralCodes,
        commission:      {
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

function normalizeSubPlan(raw) {
  return {
    type:            raw?.type            ?? "revshare",
    revshareRate:    Number(raw?.revshareRate)    || 0,
    cpaSharePercent: Number(raw?.cpaSharePercent) || 0,
  };
}

// GET /affiliate-portal/sub-payouts
// SubAffiliatePayout rows the caller is involved in. ?direction=incoming
// returns payouts the caller receives from their parent; ?direction=outgoing
// returns what the caller owes their direct subs. Default returns both.
// Optional ?year, ?month, ?status, ?product narrow the result.
exports.listSubPayouts = async (req, res) => {
  try {
    const affiliate = req.affiliateUser;
    if (affiliate.role !== "affiliate") {
      return res.status(403).json({ error: "Affiliates only" });
    }

    const direction = String(req.query.direction || "both").toLowerCase();
    const filter = {};
    if (direction === "incoming") {
      filter.subId = affiliate._id;
    } else if (direction === "outgoing") {
      filter.parentId = affiliate._id;
    } else {
      filter.$or = [{ subId: affiliate._id }, { parentId: affiliate._id }];
    }
    if (req.query.year)    filter["period.year"]  = Number(req.query.year);
    if (req.query.month)   filter["period.month"] = Number(req.query.month);
    if (req.query.status)  filter.status          = String(req.query.status);
    if (req.query.product) filter.product         = String(req.query.product);

    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const page  = Math.max(Number(req.query.page)  || 1, 1);
    const skip  = (page - 1) * limit;

    const [rows, total] = await Promise.all([
      SubAffiliatePayout.find(filter)
        .populate("parentId", "username email name")
        .populate("subId",    "username email name")
        .sort({ "period.year": -1, "period.month": -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      SubAffiliatePayout.countDocuments(filter),
    ]);

    const payouts = rows.map((r) => ({
      _id:        String(r._id),
      direction:  String(r.subId?._id ?? r.subId) === String(affiliate._id)
        ? "incoming"
        : "outgoing",
      period:     r.period,
      product:    r.product,
      parent: r.parentId ? {
        _id:      String(r.parentId._id),
        username: r.parentId.username,
        email:    r.parentId.email,
        name:     r.parentId.name,
      } : null,
      sub: r.subId ? {
        _id:      String(r.subId._id),
        username: r.subId.username,
        email:    r.subId.email,
        name:     r.subId.name,
      } : null,
      subtreeMetrics:      r.subtreeMetrics,
      subPlanSnapshot:     r.subPlanSnapshot,
      basisRevshareCents:  r.basisRevshareCents ?? 0,
      basisCpaCents:       r.basisCpaCents ?? 0,
      revshareAmountCents: r.revshareAmountCents,
      cpaAmountCents:      r.cpaAmountCents,
      payableCents:        r.payableCents,
      status:              r.status,
      calculatedAt:        r.calculatedAt,
      paidAt:              r.paidAt,
      notes:               r.notes ?? null,
    }));

    res.json({ payouts, total, page, limit });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /affiliate-portal/sub-payouts/:payoutId/mark-paid
// The parent affiliate flips an outgoing payout to paid. Only the parent on
// that edge can do this — even an operator can't (sub-payouts are internal
// to the affiliate hierarchy).
//
// This is the *manual* path — out-of-band settlement (paid the sub by some
// other means and just want to close the books). For a real Sans transfer
// use POST /sub-payouts/:id/dispatch.
exports.markSubPayoutPaid = async (req, res) => {
  try {
    const affiliate = req.affiliateUser;
    if (affiliate.role !== "affiliate") {
      return res.status(403).json({ error: "Affiliates only" });
    }

    const payout = await SubAffiliatePayout.findOne({
      _id: req.params.payoutId,
      parentId: affiliate._id,
    });
    if (!payout) {
      return res.status(404).json({ error: "Payout not found among the ones you owe" });
    }
    if (payout.status === "paid") {
      return res.json({ ok: true, payout });
    }

    // Optional free-form note (external transfer reference, etc.). Empty
    // string collapses to null so the table doesn't render a blank chip.
    const note = typeof req.body?.notes === "string" ? req.body.notes.trim() : "";

    payout.status = "paid";
    payout.paidAt = new Date();
    payout.notes = note || null;
    await payout.save();

    res.json({ ok: true, payout });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── Payout balance + Sans dispatch (affiliate → sub) ─────────────────────────

// GET /affiliate-portal/payout-balance
// Returns the affiliate's internal commission ledger:
//   earned − paidToMe − paidToMySubs = balance
// Surfaced on the sub-affiliates page so the affiliate can see at a glance
// how much they can still spend on outbound sub-payouts.
exports.getPayoutBalance = async (req, res) => {
  try {
    const affiliate = req.affiliateUser;
    if (affiliate.role !== "affiliate") {
      return res.status(403).json({ error: "Affiliates only" });
    }
    // The affiliate's tenant Operator._id comes from their AffiliateProfile
    // (each affiliate sits under exactly one operator).
    const profile = await AffiliateProfile.findOne({ user: affiliate._id })
      .select("operatorUser")
      .lean();
    if (!profile?.operatorUser) {
      return res.status(404).json({ error: "Affiliate profile not found" });
    }
    const operatorUser = await User.findById(profile.operatorUser)
      .select("operatorId")
      .lean();
    if (!operatorUser?.operatorId) {
      return res.status(500).json({ error: "Operator tenant missing" });
    }

    const balance = await computeBalance({
      operatorId: operatorUser.operatorId,
      affiliateUserId: affiliate._id,
    });
    return res.json(balance);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /affiliate-portal/sub-payouts/:payoutId/dispatch
// Parent affiliate triggers a real USDT-TRC20 transfer to a child via the
// operator's Sans merchant balance. The sub-affiliate's internal balance
// debits by `payableCents`, but the *cash* originates from the operator's
// Sans hesabı — operationally the operator's net to the parent is reduced
// by anything already paid to the parent's subs (see listPending).
exports.dispatchSubPayout = async (req, res) => {
  try {
    const affiliate = req.affiliateUser;
    if (affiliate.role !== "affiliate") {
      return res.status(403).json({ error: "Affiliates only" });
    }

    const payout = await SubAffiliatePayout.findOne({
      _id: req.params.payoutId,
      parentId: affiliate._id,
    });
    if (!payout) {
      return res.status(404).json({ error: "Payout not found among the ones you owe" });
    }
    if (!["draft", "failed"].includes(payout.status)) {
      return res.status(409).json({ error: "not_dispatchable", status: payout.status });
    }
    if (!(payout.payableCents > 0)) {
      return res.status(409).json({ error: "zero_amount" });
    }

    // Sub must have a wallet on file.
    const sub = await User.findById(payout.subId)
      .select("payoutAddress payoutNetwork email username")
      .lean();
    if (!sub?.payoutAddress) {
      return res.status(409).json({ error: "sub_has_no_wallet" });
    }

    // Balance gate — affiliate can't overdraft the operator's Sans by paying
    // more to subs than their own commission warrants.
    const balance = await computeBalance({
      operatorId: payout.operatorId,
      affiliateUserId: affiliate._id,
    });
    if (balance.balanceCents < payout.payableCents) {
      return res.status(409).json({
        error: "insufficient_balance",
        balanceCents: balance.balanceCents,
        payableCents: payout.payableCents,
      });
    }

    // Resolve an operator user under the same tenant so we can grab a Sans
    // token through the cached getSansToken machinery.
    const operatorUser = await User.findOne({
      operatorId: payout.operatorId,
      role: "operator",
      isDeleted: false,
    });
    if (!operatorUser) {
      return res.status(500).json({ error: "operator_user_not_found" });
    }

    // Snapshot the sub's wallet onto the payout row before the network call —
    // if the sub edits their wallet later we still have the audit trail of
    // where the money went.
    payout.payoutAddress = sub.payoutAddress;
    payout.payoutNetwork = sub.payoutNetwork || "TRC20";
    payout.status        = "pending";
    payout.initiatedAt   = new Date();
    payout.failureReason = null;
    await payout.save();

    // Reach into the payout controller's pure Sans helper — shared with the
    // operator → affiliate flow so the merchant integration stays in one
    // place.
    const { executeSansWithdraw } = require("./affiliatePayoutController");
    const result = await executeSansWithdraw({
      operator: operatorUser,
      amountCents:   payout.payableCents,
      payoutAddress: payout.payoutAddress,
      payoutNetwork: payout.payoutNetwork,
      extraData: {
        subPayoutId: String(payout._id),
        parentId:    String(payout.parentId),
        subId:       String(payout.subId),
        operatorId:  String(payout.operatorId),
      },
    });

    if (result.sansRequestPayload) payout.sansRequestPayload = result.sansRequestPayload;
    if (result.sansResponse)       payout.sansResponse       = result.sansResponse;

    if (result.ok) {
      payout.status = "processing";
      payout.dispatchedAt = new Date();
      payout.sansTransactionId = result.sansTransactionId;
      await payout.save();
      logger.info("sub_payout.dispatched", {
        subPayoutId: String(payout._id),
        sansTransactionId: result.sansTransactionId,
        amountCents: payout.payableCents,
      });
      return res.json({ payout: payout.toObject() });
    }

    payout.status = "failed";
    payout.failedAt = new Date();
    payout.failureReason = result.failureReason;
    await payout.save();
    logger.error("sub_payout.dispatch.failed", {
      subPayoutId: String(payout._id),
      reason: result.failureReason,
    });
    return res.status(result.httpStatus || 502).json({
      error: result.failureReason,
      upstream: result.upstream || null,
      payout: payout.toObject(),
    });
  } catch (err) {
    logger.error("sub_payout.dispatch.unexpected", {
      subPayoutId: req.params.payoutId,
      error: err?.message,
    });
    res.status(500).json({ error: err.message });
  }
};

// POST /affiliate-portal/sub-payouts/:payoutId/cancel
// Cancel a pending sub-payout before Sans dispatch (typo on wallet, wrong
// sub, etc.). Once it's processing/paid/failed it's beyond rollback here.
exports.cancelSubPayout = async (req, res) => {
  try {
    const affiliate = req.affiliateUser;
    if (affiliate.role !== "affiliate") {
      return res.status(403).json({ error: "Affiliates only" });
    }
    const payout = await SubAffiliatePayout.findOne({
      _id: req.params.payoutId,
      parentId: affiliate._id,
    });
    if (!payout) return res.status(404).json({ error: "payout_not_found" });
    if (payout.status !== "pending") {
      return res.status(409).json({ error: "not_pending", status: payout.status });
    }
    payout.status = "cancelled";
    await payout.save();
    return res.json({ payout: payout.toObject() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PATCH /affiliate-portal/sub-affiliates/:subId/sub-plan
// The caller sets how they compensate a DIRECT child. Each level edits only
// their own immediate subs — grandchildren are managed by their own parent
// one level down. Accepts { type, revshareRate, cpaSharePercent }; both rates
// are a % of the caller's own commission on that sub's subtree. Missing
// numeric fields default to 0.
exports.updateSubPlan = async (req, res) => {
  try {
    const affiliate = req.affiliateUser;
    if (affiliate.role !== "affiliate") {
      return res.status(403).json({ error: "Affiliates only" });
    }

    const body = req.body || {};
    const type = body.type;
    if (!["revshare", "cpa", "hybrid"].includes(type)) {
      return res.status(400).json({ error: "subPlan.type must be revshare, cpa, or hybrid" });
    }
    const revshareRate    = Number(body.revshareRate)    || 0;
    const cpaSharePercent = Number(body.cpaSharePercent) || 0;
    if (revshareRate < 0 || revshareRate > 100) {
      return res.status(400).json({ error: "revshareRate must be 0–100" });
    }
    if (cpaSharePercent < 0 || cpaSharePercent > 100) {
      return res.status(400).json({ error: "cpaSharePercent must be 0–100" });
    }

    const profile = await AffiliateProfile.findOne({
      user: req.params.subId,
      parentAffiliate: affiliate._id,
    });
    if (!profile) {
      return res.status(404).json({ error: "Sub-affiliate not found among your direct children" });
    }

    profile.subPlan = { type, revshareRate, cpaSharePercent };
    await profile.save();

    res.json({ ok: true, subPlan: normalizeSubPlan(profile.subPlan) });
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

    const { name, mobileNumber, mobileCountryCode, website } = req.body;

    const set = {
      name,
      mobileNumber: mobileNumber || null,
      mobileCountryCode: mobileCountryCode || null,
    };
    // Only touch website when the field is provided, so an unrelated update
    // doesn't wipe it. Empty string clears it.
    if (website !== undefined) {
      set.website = typeof website === "string" && website.trim()
        ? website.trim()
        : null;
    }

    const updated = await User.findByIdAndUpdate(
      affiliate._id,
      { $set: set },
      { new: true, select: "-password -twoFactorSecret" },
    ).lean();

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── Real-time postback config (affiliate's own S2S integration) ───────────────

const PostbackDelivery = require("../../models/PostbackDelivery");
const { POSTBACK_MACROS } = require("../../utils/postback");

const POSTBACK_EVENTS = ["registration", "ftd", "deposit"];

// GET /api/affiliate-portal/postback
// Returns the affiliate's postback config + the supported macros so the FE can
// render a reference, plus a small sample URL.
exports.getPostbackConfig = async (req, res) => {
  try {
    const affiliate = req.affiliateUser;
    if (affiliate.role !== "affiliate") {
      return res.status(403).json({ error: "Affiliates only" });
    }
    const profile = await AffiliateProfile.findOne({ user: affiliate._id })
      .select({ postbackEnabled: 1, postbackUrl: 1, postbackEvents: 1 })
      .lean();
    res.json({
      enabled: !!profile?.postbackEnabled,
      url: profile?.postbackUrl ?? "",
      events: profile?.postbackEvents ?? [],
      supportedEvents: POSTBACK_EVENTS,
      macros: POSTBACK_MACROS,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PATCH /api/affiliate-portal/postback
// Affiliate sets their URL template, which events fire, and the on/off switch.
exports.updatePostbackConfig = async (req, res) => {
  try {
    const affiliate = req.affiliateUser;
    if (affiliate.role !== "affiliate") {
      return res.status(403).json({ error: "Affiliates only" });
    }

    const { enabled, url, events } = req.body || {};
    const set = {};

    if (url !== undefined) {
      const trimmed = typeof url === "string" ? url.trim() : "";
      if (trimmed && !/^https?:\/\//i.test(trimmed)) {
        return res.status(400).json({ error: "Postback URL must start with http:// or https://" });
      }
      set.postbackUrl = trimmed || null;
    }

    if (events !== undefined) {
      if (!Array.isArray(events) || events.some((e) => !POSTBACK_EVENTS.includes(e))) {
        return res.status(400).json({ error: `events must be a subset of: ${POSTBACK_EVENTS.join(", ")}` });
      }
      set.postbackEvents = events;
    }

    if (enabled !== undefined) {
      // Can't enable without a URL — guard against a no-op "on" state.
      const effectiveUrl = set.postbackUrl !== undefined
        ? set.postbackUrl
        : (await AffiliateProfile.findOne({ user: affiliate._id }).select({ postbackUrl: 1 }).lean())?.postbackUrl;
      if (enabled && !effectiveUrl) {
        return res.status(400).json({ error: "Set a postback URL before enabling" });
      }
      set.postbackEnabled = !!enabled;
    }

    const profile = await AffiliateProfile.findOneAndUpdate(
      { user: affiliate._id },
      { $set: set },
      { new: true, select: { postbackEnabled: 1, postbackUrl: 1, postbackEvents: 1 } },
    ).lean();
    if (!profile) return res.status(404).json({ error: "Affiliate profile not found" });

    res.json({
      enabled: !!profile.postbackEnabled,
      url: profile.postbackUrl ?? "",
      events: profile.postbackEvents ?? [],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/affiliate-portal/postback/deliveries?limit=
// Recent postback attempts for this affiliate (delivery log).
exports.listPostbackDeliveries = async (req, res) => {
  try {
    const affiliate = req.affiliateUser;
    if (affiliate.role !== "affiliate") {
      return res.status(403).json({ error: "Affiliates only" });
    }
    const lim = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const deliveries = await PostbackDelivery.find({ affiliateId: affiliate._id })
      .sort({ createdAt: -1 })
      .limit(lim)
      .select({
        event: 1, playerId: 1, clickId: 1, amountCents: 1, currency: 1,
        status: 1, attempts: 1, responseStatus: 1, finalUrl: 1, lastError: 1,
        createdAt: 1, sentAt: 1,
      })
      .lean();
    res.json({ deliveries });
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
      Brand.find({ operatorId, enabled: true })
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
        depositFeePercent:       f.depositFeePercent ?? f.paymentSystemFeePercent ?? null,
        withdrawalFeePercent:    f.withdrawalFeePercent ?? null,
        jackpotFeePercent:       f.jackpotFeePercent ?? null,
        casinoTaxPercent:        f.casinoTaxPercent ?? null,
        sbThirdPartyFeePercent:  f.sbThirdPartyFeePercent ?? null,
        customNgrFeePercent:     f.customNgrFeePercent ?? null,
        customDepositFeePercent: f.customDepositFeePercent ?? null,
        alwaysDeductCustomFees:  !!f.alwaysDeductCustomFees,
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
        depositFeePercent:       defaultSettings.depositFeePercent ?? defaultSettings.paymentSystemFeePercent ?? null,
        withdrawalFeePercent:    defaultSettings.withdrawalFeePercent ?? null,
        jackpotFeePercent:       defaultSettings.jackpotFeePercent ?? null,
        casinoTaxPercent:        defaultSettings.casinoTaxPercent ?? null,
        sbThirdPartyFeePercent:  defaultSettings.sbThirdPartyFeePercent ?? null,
        customNgrFeePercent:     defaultSettings.customNgrFeePercent ?? null,
        customDepositFeePercent: defaultSettings.customDepositFeePercent ?? null,
        alwaysDeductCustomFees:  !!defaultSettings.alwaysDeductCustomFees,
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

    // Only allow generating for brands the affiliate's operator owns;
    // defends against an affiliate POSTing a foreign brand id.
    const brand = await Brand.findOne({
      _id: brandId,
      operatorId: affiliate.operatorId,
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

// ── Payout wallet ─────────────────────────────────────────────────────────────
//
// Affiliate-owned endpoints to set + read the USDT-TRC20 wallet address the
// operator will dispatch payouts to. Kept separate from /profile so the form
// state, error handling, and re-fetch cadence can live on its own component.

// GET /api/affiliate-portal/payout-info
exports.getPayoutInfo = async (req, res) => {
  try {
    const affiliate = req.affiliateUser;
    if (affiliate.role !== "affiliate") {
      return res.status(403).json({ error: "Affiliates only" });
    }
    return res.json({
      payoutAddress:      affiliate.payoutAddress || null,
      payoutNetwork:      affiliate.payoutNetwork || "TRC20",
      payoutAddressSetAt: affiliate.payoutAddressSetAt || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PUT /api/affiliate-portal/payout-info
// Body: { payoutAddress }  — TRC20 USDT address. payoutNetwork is implicit
// (only TRC20 supported today); enforced server-side so a misbehaving client
// can't try to slip in a different network.
exports.updatePayoutInfo = async (req, res) => {
  try {
    const affiliate = req.affiliateUser;
    if (affiliate.role !== "affiliate") {
      return res.status(403).json({ error: "Affiliates only" });
    }

    const raw = (req.body && req.body.payoutAddress) || "";
    const address = String(raw).trim();
    if (!address) {
      return res.status(400).json({ error: "payoutAddress is required" });
    }
    if (!TRC20_RE.test(address)) {
      return res.status(400).json({
        error: "Invalid TRC20 address — must be 34 chars starting with T",
      });
    }

    const updated = await User.findByIdAndUpdate(
      affiliate._id,
      {
        $set: {
          payoutAddress: address,
          payoutNetwork: "TRC20",
          payoutAddressSetAt: new Date(),
        },
      },
      { new: true, select: "payoutAddress payoutNetwork payoutAddressSetAt" },
    ).lean();

    return res.json({
      payoutAddress:      updated.payoutAddress,
      payoutNetwork:      updated.payoutNetwork,
      payoutAddressSetAt: updated.payoutAddressSetAt,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/affiliate-portal/payouts?limit=&before=
// Affiliate sees their own payout history (read-only).
exports.listMyPayouts = async (req, res) => {
  try {
    const affiliate = req.affiliateUser;
    if (affiliate.role !== "affiliate") {
      return res.status(403).json({ error: "Affiliates only" });
    }
    const { limit, before } = req.query || {};
    const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);

    const match = { affiliateId: affiliate._id };
    if (before) match.createdAt = { $lt: new Date(before) };

    const payouts = await AffiliatePayout.find(match)
      .sort({ createdAt: -1 })
      .limit(lim)
      .lean();

    return res.json({ payouts, count: payouts.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── Affiliate API key + referral-code list ──────────────────────────────────
// The key authenticates the affiliate's own systems against the read-only
// pull API (/api/affiliate-api/v1). These two management endpoints run under
// the JWT-authed portal so the affiliate can view + rotate the key on screen.

function newApiKey() {
  return `aff_${crypto.randomBytes(24).toString("hex")}`;
}

// GET /api/affiliate-portal/api-key
exports.getApiKey = async (req, res) => {
  const affiliate = req.affiliateUser;
  if (affiliate.role !== "affiliate") {
    return res.status(403).json({ error: "Affiliates only" });
  }
  try {
    const profile = await AffiliateProfile.findOne({ user: affiliate._id })
      .select("apiKey")
      .lean();
    return res.json({ apiKey: profile?.apiKey ?? null });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// POST /api/affiliate-portal/api-key/rotate — generate (or replace) the key.
exports.rotateApiKey = async (req, res) => {
  const affiliate = req.affiliateUser;
  if (affiliate.role !== "affiliate") {
    return res.status(403).json({ error: "Affiliates only" });
  }
  try {
    const apiKey = newApiKey();
    const updated = await AffiliateProfile.findOneAndUpdate(
      { user: affiliate._id },
      { $set: { apiKey } },
      { new: true },
    ).select("apiKey");
    if (!updated) return res.status(404).json({ error: "profile_not_found" });
    return res.json({ apiKey });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// GET /api/affiliate-api/v1/referral-codes — the affiliate's per-brand codes,
// same shape the portal overview surfaces (reuses buildBrandCodes).
exports.referralCodes = async (req, res) => {
  const affiliate = req.affiliateUser;
  if (affiliate.role !== "affiliate") {
    return res.status(403).json({ error: "Affiliates only" });
  }
  try {
    const profile = await AffiliateProfile.findOne({ user: affiliate._id }).lean();
    return res.json({ referralCodes: await buildBrandCodes(profile) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
