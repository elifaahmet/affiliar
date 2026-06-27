const clickhouse = require("../../config/clickhouse");
const BonusCampaign = require("../../models/BonusCampaign");
const BonusAward = require("../../models/BonusAward");
const Brand = require("../../models/Brand");
const User = require("../../models/User");
const { notify, notifyOperatorOwners } = require("../../utils/notify");

const METRICS = {
  ftd:           { col: "SUM(ftd_count)",          label: "FTDs",          money: false },
  registrations: { col: "SUM(registrations)",      label: "Registrations", money: false },
  ngr:           { col: "SUM(casino_ngr_cents)",   label: "NGR",           money: true },
  deposits:      { col: "SUM(deposits_sum_cents)", label: "Deposits",      money: true },
  ggr:           { col: "SUM(casino_ggr_cents)",   label: "GGR",           money: true },
};

async function chRows(sql, query_params) {
  const r = await clickhouse.query({ query: sql, query_params, format: "JSONEachRow" });
  return r.json();
}
const eur = (cents) => `€${(Number(cents || 0) / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
function fmtDay(d, endOfDay = false) {
  const x = new Date(d);
  const day = x.toISOString().slice(0, 10);
  return `${day} ${endOfDay ? "23:59:59" : "00:00:00"}`;
}

function chScope(campaign) {
  const conds = ["tenant_id = {tenantId:String}", "affiliate_id != ''", "from_ts >= {from:DateTime}", "from_ts <= {to:DateTime}"];
  const cp = { tenantId: String(campaign.operatorId), from: fmtDay(campaign.startDate), to: fmtDay(campaign.endDate, true) };
  if (campaign.brandId) { conds.push("brand_id = {brandId:String}"); cp.brandId = String(campaign.brandId); }
  return { where: conds.join(" AND "), cp };
}

// Per-affiliate metric values across the campaign window.
async function affiliateValues(campaign) {
  const m = METRICS[campaign.metric];
  const { where, cp } = chScope(campaign);
  const rows = await chRows(
    `SELECT affiliate_id AS id, ${m.col} AS value
     FROM affiliate.activity WHERE ${where}
     GROUP BY affiliate_id ORDER BY value DESC`,
    cp,
  );
  return rows.map((r) => ({ id: String(r.id), value: Number(r.value) || 0 }));
}

// One affiliate's value (affiliate-facing progress).
async function affiliateValue(campaign, affiliateId) {
  const m = METRICS[campaign.metric];
  const { where, cp } = chScope(campaign);
  const rows = await chRows(
    `SELECT ${m.col} AS value FROM affiliate.activity
     WHERE ${where} AND affiliate_id = {affId:String}`,
    { ...cp, affId: String(affiliateId) },
  );
  return Number(rows?.[0]?.value) || 0;
}

// Grant awards for whoever crossed the target; notify on each new award.
// Idempotent via the unique (campaignId, affiliateId) index.
async function evaluateCampaign(campaign) {
  const vals = await affiliateValues(campaign);
  const winners = vals.filter((r) => r.value >= campaign.target);
  const created = [];
  for (const w of winners) {
    try {
      const award = await BonusAward.create({
        campaignId: campaign._id, operatorId: campaign.operatorId, affiliateId: w.id,
        metric: campaign.metric, value: w.value, target: campaign.target,
        rewardCents: campaign.rewardCents, currency: campaign.currency, achievedAt: new Date(),
      });
      created.push(award);
    } catch (e) {
      if (e.code !== 11000) throw e; // already awarded → skip
    }
  }
  if (created.length) {
    const names = new Map(
      (await User.find({ _id: { $in: created.map((a) => a.affiliateId) } }).select("username name email").lean())
        .map((u) => [String(u._id), u.name || u.username || u.email]),
    );
    for (const a of created) {
      notify({
        userId: a.affiliateId, operatorId: campaign.operatorId, type: "bonus_earned",
        title: `🎉 You earned a ${eur(a.rewardCents)} bonus!`,
        body: `You hit "${campaign.name}" — reached the ${METRICS[campaign.metric].label} target.`,
        link: "/affiliate/bonuses",
      });
    }
    notifyOperatorOwners(campaign.operatorId, {
      type: "bonus_awarded",
      title: `Bonus campaign milestone: ${campaign.name}`,
      body: `${created.length} affiliate(s) just reached the target: ${created.map((a) => names.get(String(a.affiliateId)) || "?").join(", ")}.`,
      link: "/bonus-campaigns",
    });
  }
  return created;
}

function publicCampaign(c) {
  const now = Date.now();
  const phase = c.status === "archived" ? "archived"
    : now < new Date(c.startDate).getTime() ? "upcoming"
    : now > new Date(c.endDate).getTime() ? "ended" : "active";
  return { ...c, phase, metricLabel: METRICS[c.metric]?.label, metricIsMoney: !!METRICS[c.metric]?.money };
}

const bonusCampaignController = {
  metricsCatalog(_req, res) {
    res.json({ metrics: Object.entries(METRICS).map(([k, v]) => ({ key: k, label: v.label, money: v.money })) });
  },

  // ── Operator ───────────────────────────────────────────────────────────────
  async list(req, res) {
    try {
      const user = req.affiliateUser;
      const campaigns = await BonusCampaign.find({ operatorId: user.operatorId })
        .populate("brandId", "name").sort({ createdAt: -1 }).lean();
      const counts = await BonusAward.aggregate([
        { $match: { operatorId: user.operatorId } },
        { $group: { _id: { c: "$campaignId", s: "$status" }, n: { $sum: 1 } } },
      ]);
      const byCampaign = new Map();
      for (const row of counts) {
        const key = String(row._id.c);
        const cur = byCampaign.get(key) || { awards: 0, paid: 0 };
        cur.awards += row.n;
        if (row._id.s === "paid") cur.paid += row.n;
        byCampaign.set(key, cur);
      }
      res.json({
        campaigns: campaigns.map((c) => ({ ...publicCampaign(c), ...(byCampaign.get(String(c._id)) || { awards: 0, paid: 0 }) })),
      });
    } catch (err) { res.status(500).json({ error: err.message }); }
  },

  async create(req, res) {
    try {
      const user = req.affiliateUser;
      const { brandId, name, description, metric, target, rewardCents, currency, startDate, endDate } = req.body || {};
      if (!name || !metric || !METRICS[metric]) return res.status(400).json({ error: "name and a valid metric are required" });
      if (!(Number(target) > 0)) return res.status(400).json({ error: "target must be > 0" });
      if (!(Number(rewardCents) > 0)) return res.status(400).json({ error: "reward must be > 0" });
      if (!startDate || !endDate || new Date(endDate) < new Date(startDate)) return res.status(400).json({ error: "Invalid date range" });
      if (brandId) {
        const brand = await Brand.findOne({ _id: brandId, operatorId: user.operatorId }).select({ _id: 1 }).lean();
        if (!brand) return res.status(400).json({ error: "Unknown brand" });
      }
      const campaign = await BonusCampaign.create({
        operatorId: user.operatorId, brandId: brandId || null, name: String(name).trim(),
        description: description || null, metric, target: Number(target), rewardCents: Number(rewardCents),
        currency: currency || "EUR", startDate: new Date(startDate), endDate: new Date(endDate), createdBy: user._id,
      });
      res.status(201).json({ campaign: publicCampaign(campaign.toObject()) });
    } catch (err) { res.status(500).json({ error: err.message }); }
  },

  async update(req, res) {
    try {
      const user = req.affiliateUser;
      const allowed = ["name", "description", "target", "rewardCents", "startDate", "endDate", "status"];
      const set = {};
      for (const k of allowed) if (k in (req.body || {})) set[k] = req.body[k];
      if (set.status && !["active", "archived"].includes(set.status)) return res.status(400).json({ error: "Invalid status" });
      const campaign = await BonusCampaign.findOneAndUpdate(
        { _id: req.params.id, operatorId: user.operatorId }, { $set: set }, { new: true },
      ).populate("brandId", "name").lean();
      if (!campaign) return res.status(404).json({ error: "Not found" });
      res.json({ campaign: publicCampaign(campaign) });
    } catch (err) { res.status(500).json({ error: err.message }); }
  },

  async remove(req, res) {
    try {
      const user = req.affiliateUser;
      const paid = await BonusAward.countDocuments({ campaignId: req.params.id, operatorId: user.operatorId, status: "paid" });
      if (paid > 0) return res.status(400).json({ error: "Campaign has paid awards — archive it instead of deleting." });
      const r = await BonusCampaign.deleteOne({ _id: req.params.id, operatorId: user.operatorId });
      if (!r.deletedCount) return res.status(404).json({ error: "Not found" });
      await BonusAward.deleteMany({ campaignId: req.params.id });
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  },

  // Leaderboard + awards for one campaign.
  async progress(req, res) {
    try {
      const user = req.affiliateUser;
      const campaign = await BonusCampaign.findOne({ _id: req.params.id, operatorId: user.operatorId }).lean();
      if (!campaign) return res.status(404).json({ error: "Not found" });
      const [vals, awards] = await Promise.all([
        affiliateValues(campaign),
        BonusAward.find({ campaignId: campaign._id }).lean(),
      ]);
      const ids = [...new Set([...vals.map((v) => v.id), ...awards.map((a) => String(a.affiliateId))])];
      const names = new Map(
        (await User.find({ _id: { $in: ids } }).select("username name email").lean())
          .map((u) => [String(u._id), u.name || u.username || u.email]),
      );
      const awardedSet = new Set(awards.map((a) => String(a.affiliateId)));
      res.json({
        campaign: publicCampaign(campaign),
        leaderboard: vals.slice(0, 50).map((v) => ({
          affiliateId: v.id, name: names.get(v.id) || v.id, value: v.value,
          achieved: v.value >= campaign.target, awarded: awardedSet.has(v.id),
        })),
        awards: awards.map((a) => ({ ...a, name: names.get(String(a.affiliateId)) || String(a.affiliateId) })),
      });
    } catch (err) { res.status(500).json({ error: err.message }); }
  },

  async evaluate(req, res) {
    try {
      const user = req.affiliateUser;
      const campaign = await BonusCampaign.findOne({ _id: req.params.id, operatorId: user.operatorId }).lean();
      if (!campaign) return res.status(404).json({ error: "Not found" });
      const created = await evaluateCampaign(campaign);
      res.json({ newAwards: created.length });
    } catch (err) { res.status(500).json({ error: err.message }); }
  },

  async markAwardPaid(req, res) {
    try {
      const user = req.affiliateUser;
      const award = await BonusAward.findOneAndUpdate(
        { _id: req.params.awardId, operatorId: user.operatorId },
        { $set: { status: "paid", paidAt: new Date(), note: req.body?.note || null } },
        { new: true },
      ).lean();
      if (!award) return res.status(404).json({ error: "Not found" });
      res.json({ award });
    } catch (err) { res.status(500).json({ error: err.message }); }
  },

  // ── Affiliate (mounted under /affiliate-portal/bonuses) ──────────────────────
  async affiliateList(req, res) {
    try {
      const user = req.affiliateUser;
      if (user.role !== "affiliate") return res.status(403).json({ error: "Affiliates only" });
      const now = new Date();
      const campaigns = await BonusCampaign.find({
        operatorId: user.operatorId, status: "active",
        startDate: { $lte: now }, endDate: { $gte: now },
      }).populate("brandId", "name").sort({ endDate: 1 }).lean();

      const withProgress = await Promise.all(campaigns.map(async (c) => {
        const value = await affiliateValue(c, user._id);
        return { ...publicCampaign(c), value, achieved: value >= c.target };
      }));

      const awards = await BonusAward.find({ affiliateId: user._id })
        .populate("campaignId", "name metric").sort({ achievedAt: -1 }).lean();

      res.json({ campaigns: withProgress, awards });
    } catch (err) { res.status(500).json({ error: err.message }); }
  },
};

module.exports = bonusCampaignController;
module.exports.evaluateCampaign = evaluateCampaign;
