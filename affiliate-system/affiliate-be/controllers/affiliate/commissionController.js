const CommissionPlan   = require("../../models/CommissionPlan");
const CommissionReport = require("../../models/CommissionReport");
const AffiliateProfile = require("../../models/AffiliateProfile");
const User             = require("../../models/User");
const clickhouse       = require("../../config/clickhouse");
const { calculate }    = require("../../engine/commissionEngine");

// ── ClickHouse helpers ────────────────────────────────────────────────────────

function periodRange(year, month) {
  const pad = (n) => String(n).padStart(2, "0");
  const lastDay = new Date(year, month, 0).getDate(); // month is 1-based here
  return {
    fromTs: `${year}-${pad(month)}-01 00:00:00`,
    toTs:   `${year}-${pad(month)}-${pad(lastDay)} 23:59:59`,
  };
}

async function fetchAffiliateMetrics(tenantId, year, month) {
  const { fromTs, toTs } = periodRange(year, month);

  const sql = `
    SELECT
      affiliate_id                          AS affiliateId,
      any(affiliate_code)                   AS affiliateCode,
      SUM(casino_ggr_cents)                 AS ggrCents,
      SUM(casino_ngr_cents)                 AS ngrCents,
      SUM(ftd_count)                        AS ftdCount,
      SUM(deposits_count)                   AS depositsCount,
      SUM(deposits_sum_cents)               AS depositsCents,
      SUM(registrations)                    AS registrations,
      uniqExact(player_id)                  AS playerCount
    FROM affiliate.activity
    WHERE
      tenant_id = {tenantId:String}
      AND from_ts >= {fromTs:DateTime}
      AND from_ts <= {toTs:DateTime}
      AND affiliate_id != ''
    GROUP BY affiliate_id
  `;

  const result = await clickhouse.query({
    query: sql,
    query_params: { tenantId, fromTs, toTs },
    format: "JSONEachRow",
  });

  const rows = await result.json();

  return rows.map((r) => ({
    affiliateId:   r.affiliateId,
    affiliateCode: r.affiliateCode,
    ggrCents:      Number(r.ggrCents),
    ngrCents:      Number(r.ngrCents),
    ftdCount:      Number(r.ftdCount),
    depositsCount: Number(r.depositsCount),
    depositsCents: Number(r.depositsCents),
    registrations: Number(r.registrations),
    playerCount:   Number(r.playerCount),
  }));
}

// ── Plan helpers ──────────────────────────────────────────────────────────────

async function resolveAffiliatePlan(affiliateUserId, operatorId) {
  const profile = await AffiliateProfile.findOne({ user: affiliateUserId })
    .populate("commissionPlanId")
    .lean();

  if (profile?.commissionPlanId) return profile.commissionPlanId;

  // Fall back to operator default
  return CommissionPlan.findOne({ operatorId, isDefault: true, isActive: true }).lean();
}

// ── Commission Plans ──────────────────────────────────────────────────────────

const planController = {
  async list(req, res) {
    try {
      const operator = req.affiliateUser;
      if (operator.role !== "operator") return res.status(403).json({ error: "Operators only" });

      const plans = await CommissionPlan.find({ operatorId: operator.operatorId })
        .sort({ isDefault: -1, createdAt: -1 })
        .lean();

      res.json(plans);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async create(req, res) {
    try {
      const operator = req.affiliateUser;
      if (operator.role !== "operator") return res.status(403).json({ error: "Operators only" });

      const { name, type, revshare, cpa, tiers, isDefault, notes } = req.body;
      if (!name || !type) return res.status(400).json({ error: "name and type are required" });

      // If this will be default, unset any existing default
      if (isDefault) {
        await CommissionPlan.updateMany(
          { operatorId: operator.operatorId, isDefault: true },
          { $set: { isDefault: false } },
        );
      }

      const plan = await CommissionPlan.create({
        operatorId: operator.operatorId,
        name,
        type,
        revshare: revshare ?? { metric: "ngr", rate: 0 },
        cpa:      cpa      ?? { amountCents: 0, currency: "USD" },
        tiers:    tiers    ?? [],
        isDefault: isDefault ?? false,
        notes: notes ?? null,
      });

      res.status(201).json(plan);
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  },

  async update(req, res) {
    try {
      const operator = req.affiliateUser;
      if (operator.role !== "operator") return res.status(403).json({ error: "Operators only" });

      const plan = await CommissionPlan.findOne({
        _id: req.params.id,
        operatorId: operator.operatorId,
      });
      if (!plan) return res.status(404).json({ error: "Plan not found" });

      const { name, type, revshare, cpa, tiers, isDefault, isActive, notes } = req.body;

      if (isDefault && !plan.isDefault) {
        await CommissionPlan.updateMany(
          { operatorId: operator.operatorId, isDefault: true },
          { $set: { isDefault: false } },
        );
      }

      Object.assign(plan, {
        ...(name      !== undefined && { name }),
        ...(type      !== undefined && { type }),
        ...(revshare  !== undefined && { revshare }),
        ...(cpa       !== undefined && { cpa }),
        ...(tiers     !== undefined && { tiers }),
        ...(isDefault !== undefined && { isDefault }),
        ...(isActive  !== undefined && { isActive }),
        ...(notes     !== undefined && { notes }),
      });

      await plan.save();
      res.json(plan);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async remove(req, res) {
    try {
      const operator = req.affiliateUser;
      if (operator.role !== "operator") return res.status(403).json({ error: "Operators only" });

      const plan = await CommissionPlan.findOneAndDelete({
        _id: req.params.id,
        operatorId: operator.operatorId,
      });
      if (!plan) return res.status(404).json({ error: "Plan not found" });

      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async setDefault(req, res) {
    try {
      const operator = req.affiliateUser;
      if (operator.role !== "operator") return res.status(403).json({ error: "Operators only" });

      await CommissionPlan.updateMany(
        { operatorId: operator.operatorId, isDefault: true },
        { $set: { isDefault: false } },
      );
      const plan = await CommissionPlan.findOneAndUpdate(
        { _id: req.params.id, operatorId: operator.operatorId },
        { $set: { isDefault: true } },
        { new: true },
      );
      if (!plan) return res.status(404).json({ error: "Plan not found" });

      res.json(plan);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
};

// ── Commission Reports ────────────────────────────────────────────────────────

const reportController = {
  async list(req, res) {
    try {
      const operator = req.affiliateUser;
      if (operator.role !== "operator") return res.status(403).json({ error: "Operators only" });

      const { year, month, status, affiliateId, page = 1, limit = 50 } = req.query;

      const filter = { operatorId: operator.operatorId };
      if (year)        filter["period.year"]  = Number(year);
      if (month)       filter["period.month"] = Number(month);
      if (status)      filter.status = status;
      if (affiliateId) filter.affiliateId = affiliateId;

      const skip = (Number(page) - 1) * Number(limit);

      const [reports, total] = await Promise.all([
        CommissionReport.find(filter)
          .populate("affiliateId", "username email name")
          .populate("planId", "name type")
          .sort({ "period.year": -1, "period.month": -1, "breakdown.totalCents": -1 })
          .skip(skip)
          .limit(Number(limit))
          .lean(),
        CommissionReport.countDocuments(filter),
      ]);

      res.json({ reports, total, page: Number(page), limit: Number(limit) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  /**
   * Calculate (or recalculate) commission reports for a given month.
   * Creates/updates one report per affiliate that has activity in the period.
   * Will NOT overwrite approved or paid reports unless force=true is passed.
   */
  async calculate(req, res) {
    try {
      const operator = req.affiliateUser;
      if (operator.role !== "operator") return res.status(403).json({ error: "Operators only" });

      const { year, month, force = false } = req.body;
      if (!year || !month) return res.status(400).json({ error: "year and month are required" });

      const y = Number(year);
      const m = Number(month);
      if (m < 1 || m > 12) return res.status(400).json({ error: "month must be 1-12" });

      // Pull metrics from ClickHouse grouped by affiliate
      const rows = await fetchAffiliateMetrics(operator.operatorId.toString(), y, m);

      if (rows.length === 0) {
        return res.json({ message: "No affiliate activity found for this period", created: 0, skipped: 0 });
      }

      // Resolve User IDs from ClickHouse affiliateId strings
      const affiliateProfiles = await AffiliateProfile.find({
        operatorUser: operator._id,
      }).lean();

      // Build a map: affiliateId string → User ObjectId
      const idMap = new Map();
      for (const profile of affiliateProfiles) {
        // ClickHouse writes affiliate_id = profile.user, so self-map the
        // user id. Legacy profile.affiliateId is kept for back-compat.
        if (profile.user) {
          idMap.set(String(profile.user), profile.user);
        }
        if (profile.affiliateId) {
          idMap.set(String(profile.affiliateId), profile.user);
        }
      }

      // Also look up by referral code as fallback
      for (const profile of affiliateProfiles) {
        for (const code of profile.referralCodes ?? []) {
          idMap.set(`code:${code}`, profile.user);
        }
      }

      const results = { created: 0, updated: 0, skipped: 0, failed: [] };

      for (const row of rows) {
        try {
          // Resolve affiliate User _id
          const affiliateUserId =
            idMap.get(row.affiliateId) ?? idMap.get(`code:${row.affiliateCode}`);

          if (!affiliateUserId) {
            results.failed.push({
              affiliateId: row.affiliateId,
              error: "Affiliate not found in this operator",
            });
            continue;
          }

          // Check for locked report
          const existing = await CommissionReport.findOne({
            operatorId: operator.operatorId,
            affiliateId: affiliateUserId,
            "period.year": y,
            "period.month": m,
          });

          if (existing && ["approved", "paid"].includes(existing.status) && !force) {
            results.skipped++;
            continue;
          }

          // Resolve commission plan
          const plan = await resolveAffiliatePlan(affiliateUserId, operator.operatorId);

          let breakdown = { revshareAmountCents: 0, cpaAmountCents: 0, totalCents: 0 };
          let planId     = null;
          let planSnap   = null;

          if (plan) {
            breakdown = calculate(plan, row);
            planId    = plan._id;
            planSnap  = {
              _id:      plan._id,
              name:     plan.name,
              type:     plan.type,
              revshare: plan.revshare,
              cpa:      plan.cpa,
              tiers:    plan.tiers,
            };
          }

          const directCents = breakdown.revshareAmountCents + breakdown.cpaAmountCents;

          const metrics = {
            ggrCents:      row.ggrCents,
            ngrCents:      row.ngrCents,
            ftdCount:      row.ftdCount,
            depositsCount: row.depositsCount,
            depositsCents: row.depositsCents,
            playerCount:   row.playerCount,
            registrations: row.registrations,
          };

          const fullBreakdown = {
            ...breakdown,
            directCents,
            overrideCents: existing?.breakdown?.overrideCents ?? 0,
            totalCents:    directCents + (existing?.breakdown?.overrideCents ?? 0),
          };

          if (existing) {
            await CommissionReport.updateOne(
              { _id: existing._id },
              {
                $set: {
                  affiliateCode: row.affiliateCode,
                  planId,
                  planSnapshot: planSnap,
                  metrics,
                  breakdown: fullBreakdown,
                  status: "draft",
                  calculatedAt: new Date(),
                  approvedAt: null,
                  approvedBy: null,
                  paidAt: null,
                },
              },
            );
            results.updated++;
          } else {
            await CommissionReport.create({
              operatorId:    operator.operatorId,
              affiliateId:   affiliateUserId,
              affiliateCode: row.affiliateCode,
              planId,
              planSnapshot:  planSnap,
              period: { year: y, month: m },
              metrics,
              breakdown: fullBreakdown,
              overrideFromSubs: [],
              status: "draft",
              calculatedAt: new Date(),
            });
            results.created++;
          }
        } catch (err) {
          results.failed.push({ affiliateId: row.affiliateId, error: err.message });
        }
      }

      // ── Override pass: credit parent affiliates ──────────────────────────────
      // Find all sub-affiliates (have a parent) for this operator
      const subProfiles = await AffiliateProfile.find({
        operatorUser: operator._id,
        parentAffiliate: { $ne: null },
        overrideRate: { $gt: 0 },
      }).lean();

      for (const subProfile of subProfiles) {
        try {
          // Find sub's report for this period
          const subReport = await CommissionReport.findOne({
            operatorId: operator.operatorId,
            affiliateId: subProfile.user,
            "period.year": y,
            "period.month": m,
          }).lean();

          if (!subReport || subReport.metrics.ngrCents <= 0) continue;

          const overrideCents = Math.floor(
            (Math.max(0, subReport.metrics.ngrCents) * subProfile.overrideRate) / 100
          );
          if (overrideCents === 0) continue;

          const subEntry = {
            subAffiliateId:   subProfile.user,
            subAffiliateCode: subReport.affiliateCode,
            ngrCents:         subReport.metrics.ngrCents,
            overrideRate:     subProfile.overrideRate,
            overrideCents,
          };

          // Find or create parent's report
          const parentReport = await CommissionReport.findOne({
            operatorId: operator.operatorId,
            affiliateId: subProfile.parentAffiliate,
            "period.year": y,
            "period.month": m,
          });

          if (parentReport) {
            // Remove stale entry for this sub then re-add
            const otherSubs = (parentReport.overrideFromSubs || []).filter(
              (e) => e.subAffiliateId?.toString() !== subProfile.user.toString()
            );
            const newOverrideFromSubs  = [...otherSubs, subEntry];
            const newOverrideCents     = newOverrideFromSubs.reduce((s, e) => s + e.overrideCents, 0);
            const newTotalCents        = parentReport.breakdown.directCents + newOverrideCents;

            await CommissionReport.updateOne(
              { _id: parentReport._id },
              {
                $set: {
                  overrideFromSubs: newOverrideFromSubs,
                  "breakdown.overrideCents": newOverrideCents,
                  "breakdown.totalCents":    newTotalCents,
                },
              }
            );
          } else {
            // Parent had no direct activity this month — create a zero-direct report
            const parentProfile = await AffiliateProfile.findOne({
              user: subProfile.parentAffiliate,
              operatorUser: operator._id,
            }).lean();
            const parentUser = await User.findById(subProfile.parentAffiliate)
              .select("username").lean();

            if (!parentProfile || !parentUser) continue;

            const parentCode = parentProfile.referralCodes?.[0] ?? "";

            await CommissionReport.create({
              operatorId:      operator.operatorId,
              affiliateId:     subProfile.parentAffiliate,
              affiliateCode:   parentCode,
              planId:          null,
              planSnapshot:    null,
              period:          { year: y, month: m },
              metrics:         { ggrCents: 0, ngrCents: 0, ftdCount: 0,
                                 depositsCount: 0, depositsCents: 0,
                                 playerCount: 0, registrations: 0 },
              breakdown: {
                revshareAmountCents: 0,
                cpaAmountCents:      0,
                directCents:         0,
                overrideCents,
                totalCents:          overrideCents,
              },
              overrideFromSubs: [subEntry],
              status:          "draft",
              calculatedAt:    new Date(),
            });
            results.created++;
          }
        } catch (err) {
          results.failed.push({
            affiliateId: subProfile.parentAffiliate?.toString(),
            error: `Override calc failed: ${err.message}`,
          });
        }
      }

      res.json(results);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async submitForApproval(req, res) {
    try {
      const operator = req.affiliateUser;
      if (operator.role !== "operator") return res.status(403).json({ error: "Operators only" });

      // Can submit all drafts for a period, or a single report
      const { year, month, reportId } = req.body;

      const filter = { operatorId: operator.operatorId, status: "draft" };
      if (reportId)     filter._id = reportId;
      else if (year && month) {
        filter["period.year"]  = Number(year);
        filter["period.month"] = Number(month);
      }

      const result = await CommissionReport.updateMany(filter, {
        $set: { status: "pending_approval" },
      });

      res.json({ updated: result.modifiedCount });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async approve(req, res) {
    try {
      const operator = req.affiliateUser;
      if (operator.role !== "operator") return res.status(403).json({ error: "Operators only" });

      const filter = { operatorId: operator.operatorId, status: "pending_approval" };
      const { reportId, year, month } = req.body;

      if (reportId)     filter._id = reportId;
      else if (year && month) {
        filter["period.year"]  = Number(year);
        filter["period.month"] = Number(month);
      }

      const result = await CommissionReport.updateMany(filter, {
        $set: {
          status:     "approved",
          approvedAt: new Date(),
          approvedBy: operator._id,
        },
      });

      res.json({ updated: result.modifiedCount });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async markPaid(req, res) {
    try {
      const operator = req.affiliateUser;
      if (operator.role !== "operator") return res.status(403).json({ error: "Operators only" });

      const filter = { operatorId: operator.operatorId, status: "approved" };
      const { reportId, year, month } = req.body;

      if (reportId)     filter._id = reportId;
      else if (year && month) {
        filter["period.year"]  = Number(year);
        filter["period.month"] = Number(month);
      }

      const result = await CommissionReport.updateMany(filter, {
        $set: { status: "paid", paidAt: new Date() },
      });

      res.json({ updated: result.modifiedCount });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async updateNotes(req, res) {
    try {
      const operator = req.affiliateUser;
      if (operator.role !== "operator") return res.status(403).json({ error: "Operators only" });

      const report = await CommissionReport.findOneAndUpdate(
        { _id: req.params.id, operatorId: operator.operatorId },
        { $set: { notes: req.body.notes ?? null } },
        { new: true },
      );
      if (!report) return res.status(404).json({ error: "Report not found" });

      res.json(report);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
};

// ── Affiliate plan assignment ─────────────────────────────────────────────────

const affiliatePlanController = {
  async assignPlan(req, res) {
    try {
      const operator = req.affiliateUser;
      if (operator.role !== "operator") return res.status(403).json({ error: "Operators only" });

      const { planId } = req.body; // null = revert to default

      // Verify plan belongs to operator (if provided)
      if (planId) {
        const plan = await CommissionPlan.findOne({
          _id: planId,
          operatorId: operator.operatorId,
        });
        if (!plan) return res.status(404).json({ error: "Plan not found" });
      }

      const profile = await AffiliateProfile.findOneAndUpdate(
        { user: req.params.affiliateId },
        { $set: { commissionPlanId: planId ?? null } },
        { new: true },
      );
      if (!profile) return res.status(404).json({ error: "Affiliate profile not found" });

      res.json({ ok: true, commissionPlanId: profile.commissionPlanId });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
};

module.exports = { planController, reportController, affiliatePlanController };
