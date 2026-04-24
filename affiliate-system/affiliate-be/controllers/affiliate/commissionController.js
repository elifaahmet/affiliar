const CommissionPlan           = require("../../models/CommissionPlan");
const CommissionReport         = require("../../models/CommissionReport");
const AffiliateProfile         = require("../../models/AffiliateProfile");
const User                     = require("../../models/User");
const OperatorFinancialSettings = require("../../models/OperatorFinancialSettings");
const clickhouse               = require("../../config/clickhouse");
const { calculate }             = require("../../engine/commissionEngine");
const { checkCpaQualification } = require("../../engine/cpaQualification");
const { resolveCommissionSettings } = require("../../engine/commissionSettings");

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
      SUM(casino_ggr_cents)                 AS casinoGgrCents,
      SUM(casino_ngr_cents)                 AS ngrCents,
      SUM(casino_ngr_cents)                 AS casinoNgrCents,
      SUM(sb_ggr_cents)                     AS sbGgrCents,
      SUM(sb_ngr_cents)                     AS sbNgrCents,
      SUM(combined_ngr_cents)               AS combinedNgrCents,
      SUM(ftd_count)                        AS ftdCount,
      SUM(deposits_count)                   AS depositsCount,
      SUM(deposits_sum_cents)               AS depositsCents,
      SUM(deposit_fees_sum_cents)           AS depositFeesCents,
      SUM(withdrawal_fees_sum_cents)        AS withdrawalFeesCents,
      SUM(payment_system_fees_sum_cents)    AS paymentSystemFeesCents,
      SUM(registrations)                    AS registrations,
      uniqExactIf(player_id, player_id != '__fees__')                  AS playerCount
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
    affiliateId:            r.affiliateId,
    affiliateCode:          r.affiliateCode,
    // Legacy aliases (keeps any stray caller working)
    ggrCents:               Number(r.ggrCents),
    ngrCents:               Number(r.ngrCents),
    // Product-scoped NGRs/GGRs — consumed by the engine based on plan.product
    casinoGgrCents:         Number(r.casinoGgrCents),
    casinoNgrCents:         Number(r.casinoNgrCents),
    sbGgrCents:             Number(r.sbGgrCents)  || 0,
    sbNgrCents:             Number(r.sbNgrCents)  || 0,
    combinedNgrCents:       Number(r.combinedNgrCents) || Number(r.casinoNgrCents),
    ftdCount:               Number(r.ftdCount),
    depositsCount:          Number(r.depositsCount),
    depositsCents:          Number(r.depositsCents),
    depositFeesCents:       Number(r.depositFeesCents) || 0,
    withdrawalFeesCents:    Number(r.withdrawalFeesCents) || 0,
    paymentSystemFeesCents: Number(r.paymentSystemFeesCents) || 0,
    registrations:          Number(r.registrations),
    playerCount:            Number(r.playerCount),
  }));
}

/**
 * Per-FTD context grouped by (affiliate, player, ftd_hour).
 *
 * For each FTD that falls inside the period we load:
 *   - the FTD amount + its processor fee (for the net/gross basis gate)
 *   - cumulative wager the player has produced since the FTD
 *   - cumulative cashouts since the FTD
 *   - lifetime net cash position (deposits − cashouts across all time,
 *     scoped to this tenant). Used by the cash-retention gate.
 *
 * The time-since-FTD windows extend to "now" (not to period end) so a
 * future recalc of the same period promotes FTDs as they accumulate more
 * activity or cross the hold-period threshold.
 */
async function fetchFtdContextRows(tenantId, year, month) {
  const { fromTs, toTs } = periodRange(year, month);

  const sql = `
    WITH ftds AS (
      SELECT
        affiliate_id,
        player_id,
        hour_bucket                   AS ftd_date,
        SUM(ftd_sum_cents)            AS deposit_cents,
        SUM(deposit_fees_sum_cents)   AS deposit_fee_cents
      FROM affiliate.activity_hourly_delta
      WHERE tenant_id = {tenantId:String}
        AND hour_bucket >= {fromTs:DateTime}
        AND hour_bucket <= {toTs:DateTime}
        AND ftd_count > 0
        AND player_id != '__fees__'
      GROUP BY affiliate_id, player_id, hour_bucket
    )
    SELECT
      f.affiliate_id                                           AS affiliateId,
      f.player_id                                              AS playerId,
      f.ftd_date                                               AS ftdDate,
      f.deposit_cents                                          AS depositCents,
      f.deposit_fee_cents                                      AS depositFeeCents,
      SUM(if(a.hour_bucket >= f.ftd_date,
             toInt64(a.bets_sum_cents) - toInt64(a.casino_bets_rollbacks_sum_cents),
             toInt64(0))) AS wagerSinceFtdCents,
      SUM(if(a.hour_bucket >= f.ftd_date,
             toInt64(a.cashouts_sum_cents),
             toInt64(0))) AS cashoutsSinceFtdCents,
      SUM(toInt64(a.deposits_sum_cents)) AS depositsTotalCents,
      SUM(toInt64(a.cashouts_sum_cents)) AS cashoutsTotalCents
    FROM ftds f
    LEFT JOIN affiliate.activity_hourly_delta a
      ON a.tenant_id = {tenantId:String}
     AND a.player_id = f.player_id
     AND a.player_id != '__fees__'
    GROUP BY f.affiliate_id, f.player_id, f.ftd_date,
             f.deposit_cents, f.deposit_fee_cents
  `;

  const result = await clickhouse.query({
    query: sql,
    query_params: { tenantId, fromTs, toTs },
    format: "JSONEachRow",
  });
  const rows = await result.json();

  return rows.map((r) => ({
    affiliateId:           r.affiliateId,
    playerId:              r.playerId,
    ftdDate:               r.ftdDate,
    depositCents:          Number(r.depositCents) || 0,
    depositFeeCents:       Number(r.depositFeeCents) || 0,
    wagerSinceFtdCents:    Math.max(0, Number(r.wagerSinceFtdCents) || 0),
    cashoutsSinceFtdCents: Math.max(0, Number(r.cashoutsSinceFtdCents) || 0),
    depositsTotalCents:    Math.max(0, Number(r.depositsTotalCents) || 0),
    cashoutsTotalCents:    Math.max(0, Number(r.cashoutsTotalCents) || 0),
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

/**
 * Resolve which commission plans an affiliate earns on, keyed by product
 * slot. Returns { casino, sportsbook, combined } — each value is either a
 * populated CommissionPlan document or null.
 *
 * Resolution order per slot:
 *   1. Explicit profile.commissionPlans[slot]
 *   2. Operator's default plan for that product (isDefault + product match)
 *   3. null (no commission on that product)
 *
 * Legacy compat: if the profile has no `commissionPlans` map but has the
 * old `commissionPlanId`, we slot that plan into whichever product its
 * own `product` field says (defaulting to casino for pre-sportsbook docs).
 */
async function resolveAffiliatePlansByProduct(affiliateUserId, operatorId) {
  const profile = await AffiliateProfile.findOne({ user: affiliateUserId }).lean();
  const slots = { casino: null, sportsbook: null, combined: null };

  const byId = {};
  const collectId = (id) => {
    if (!id) return;
    byId[String(id)] = null;
  };

  // Explicit per-product assignments
  const explicit = profile?.commissionPlans || {};
  collectId(explicit.casino);
  collectId(explicit.sportsbook);
  collectId(explicit.combined);
  // Legacy single-plan field
  collectId(profile?.commissionPlanId);

  // Fetch plan docs in one query
  const ids = Object.keys(byId);
  if (ids.length > 0) {
    const docs = await CommissionPlan.find({ _id: { $in: ids } }).lean();
    for (const d of docs) byId[String(d._id)] = d;
  }

  const resolveDoc = (id) => (id ? byId[String(id)] : null) || null;

  slots.casino     = resolveDoc(explicit.casino);
  slots.sportsbook = resolveDoc(explicit.sportsbook);
  slots.combined   = resolveDoc(explicit.combined);

  // Legacy fallback: if none of the new slots are set but the old
  // commissionPlanId is, drop the legacy plan into the slot matching its
  // own `product` field.
  const anySlotFilled = slots.casino || slots.sportsbook || slots.combined;
  if (!anySlotFilled && profile?.commissionPlanId) {
    const legacy = resolveDoc(profile.commissionPlanId);
    if (legacy) {
      const slot = legacy.product || "casino";
      slots[slot] = legacy;
    }
  }

  // Operator-default per product for any still-empty slot
  for (const slot of ["casino", "sportsbook", "combined"]) {
    if (slots[slot]) continue;
    const def = await CommissionPlan.findOne({
      operatorId,
      product: slot,
      isDefault: true,
      isActive: true,
    }).lean();
    if (def) slots[slot] = def;
  }

  return slots;
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

      // Operator-wide defaults (brandId=null) — loaded once and reused for
      // every plan that leaves a field null ("inherit"). Plans with
      // explicit values still override.
      const operatorFinancials = await OperatorFinancialSettings.findOne({
        operatorId: operator.operatorId,
        brandId: null,
      }).lean();
      const operatorDefaults = operatorFinancials?.defaults || {};

      // Per-FTD context for CPA qualification gates. One query for the
      // whole tenant — we bucket by affiliate downstream.
      const ftdContextRows = await fetchFtdContextRows(
        operator.operatorId.toString(),
        y,
        m,
      );
      const ftdContextByAffiliate = new Map();
      for (const f of ftdContextRows) {
        const list = ftdContextByAffiliate.get(f.affiliateId) || [];
        list.push(f);
        ftdContextByAffiliate.set(f.affiliateId, list);
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

          // Resolve per-product plan slots once per affiliate.
          const planSlots = await resolveAffiliatePlansByProduct(
            affiliateUserId,
            operator.operatorId,
          );

          // CPA qualification runs on FTDs once per affiliate — the gates
          // only care about wallet-level FTDs, not the commission product.
          const ftdRows = ftdContextByAffiliate.get(row.affiliateId) || [];

          // Per-product: choose the plan, compute breakdown, upsert one
          // CommissionReport row. A slot with no plan is skipped (no
          // commission for that product this period).
          for (const product of ["casino", "sportsbook", "combined"]) {
            const plan = planSlots[product];
            if (!plan) continue;

            const existing = await CommissionReport.findOne({
              operatorId: operator.operatorId,
              affiliateId: affiliateUserId,
              "period.year": y,
              "period.month": m,
              product,
            });

            if (existing && ["approved", "paid"].includes(existing.status) && !force) {
              results.skipped++;
              continue;
            }

            // Qualification depends on the resolved settings which can be
            // plan-specific (each product's plan may have different CPA
            // gates). Recompute per product.
            const resolvedSettings = resolveCommissionSettings(plan, operatorDefaults);
            const qualification = checkCpaQualification(ftdRows, resolvedSettings);

            const breakdown = calculate(
              plan,
              { ...row, qualifiedFtdCount: qualification.qualified },
              operatorDefaults,
            );
            const planSnap = {
              _id:      plan._id,
              name:     plan.name,
              type:     plan.type,
              product:  plan.product,
              revshare: plan.revshare,
              cpa:      plan.cpa,
              tiers:    plan.tiers,
              resolvedSettings: breakdown.resolvedSettings,
            };

            const directCents = breakdown.revshareAmountCents + breakdown.cpaAmountCents;

            // Pick the product-scoped NGR/GGR pair that actually drove
            // this report so the UI can show the right base alongside
            // the commission number.
            const productNgr =
              product === "sportsbook" ? row.sbNgrCents
              : product === "combined" ? row.combinedNgrCents
              : row.casinoNgrCents;
            const productGgr =
              product === "sportsbook" ? row.sbGgrCents
              : product === "combined" ? (row.casinoGgrCents + row.sbGgrCents)
              : row.casinoGgrCents;

            const metrics = {
              ggrCents:          productGgr,
              ngrCents:          productNgr,
              ftdCount:          row.ftdCount,
              qualifiedFtdCount: qualification.qualified,
              pendingFtdCount:   qualification.pending,
              rejectedFtdCount:  qualification.rejected,
              depositsCount:     row.depositsCount,
              depositsCents:     row.depositsCents,
              playerCount:       row.playerCount,
              registrations:     row.registrations,
            };

            const ftdQualification = [
              ...qualification.qualifiedFtds.map((f) => ({ ...f, status: "qualified" })),
              ...qualification.pendingFtds.map((f) => ({ ...f, status: "pending" })),
              ...qualification.rejectedFtds.map((f) => ({ ...f, status: "rejected" })),
            ].map((f) => ({
              playerId:     f.playerId,
              ftdDate:      f.ftdDate,
              depositCents: f.depositCents,
              status:       f.status,
              reason:       f.reason,
            }));

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
                    planId:        plan._id,
                    planSnapshot:  planSnap,
                    metrics,
                    ftdQualification,
                    breakdown: fullBreakdown,
                    status:        "draft",
                    calculatedAt:  new Date(),
                    approvedAt:    null,
                    approvedBy:    null,
                    paidAt:        null,
                  },
                },
              );
              results.updated++;
            } else {
              await CommissionReport.create({
                operatorId:    operator.operatorId,
                affiliateId:   affiliateUserId,
                affiliateCode: row.affiliateCode,
                planId:        plan._id,
                planSnapshot:  planSnap,
                period:        { year: y, month: m },
                product,
                metrics,
                ftdQualification,
                breakdown:     fullBreakdown,
                overrideFromSubs: [],
                status:        "draft",
                calculatedAt:  new Date(),
              });
              results.created++;
            }
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
          // Override applies off the sub's casino report for v1. Combined-
          // and sportsbook-only reports are ignored here; a follow-up PR
          // can expand the override semantic per-product if operators ask.
          const subReport = await CommissionReport.findOne({
            operatorId: operator.operatorId,
            affiliateId: subProfile.user,
            "period.year": y,
            "period.month": m,
            product: "casino",
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

          // Parent's casino report carries the override. Other product
          // reports aren't affected.
          const parentReport = await CommissionReport.findOne({
            operatorId: operator.operatorId,
            affiliateId: subProfile.parentAffiliate,
            "period.year": y,
            "period.month": m,
            product: "casino",
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
              product:         "casino",
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
  /**
   * PATCH /commission/affiliates/:affiliateId/plan
   *
   * Two request shapes are accepted:
   *   1. Legacy  : { planId: <id|null> }       sets the old single slot.
   *   2. Per-product: { commissionPlans: { casino, sportsbook, combined } }
   *                   any omitted slot keeps its previous value.
   *
   * Plans must belong to the operator AND their own `product` field must
   * match the slot they're being dropped into (prevents accidentally
   * routing a sportsbook plan into the casino slot).
   */
  async assignPlan(req, res) {
    try {
      const operator = req.affiliateUser;
      if (operator.role !== "operator") return res.status(403).json({ error: "Operators only" });

      const { planId, commissionPlans } = req.body;

      const existingProfile = await AffiliateProfile.findOne({
        user: req.params.affiliateId,
      }).lean();
      if (!existingProfile) return res.status(404).json({ error: "Affiliate profile not found" });

      const update = {};

      // Legacy single-plan payload
      if (planId !== undefined) {
        if (planId) {
          const plan = await CommissionPlan.findOne({
            _id: planId,
            operatorId: operator.operatorId,
          });
          if (!plan) return res.status(404).json({ error: "Plan not found" });
        }
        update.commissionPlanId = planId ?? null;
      }

      // Per-product payload
      if (commissionPlans && typeof commissionPlans === "object") {
        const validatedSlots = {
          ...(existingProfile.commissionPlans || {}),
        };
        for (const slot of ["casino", "sportsbook", "combined"]) {
          if (!(slot in commissionPlans)) continue;
          const id = commissionPlans[slot];
          if (id === null) {
            validatedSlots[slot] = null;
            continue;
          }
          const plan = await CommissionPlan.findOne({
            _id: id,
            operatorId: operator.operatorId,
          }).lean();
          if (!plan) return res.status(404).json({ error: `Plan not found for slot ${slot}` });
          // The plan's own product must match the slot it's assigned to.
          const planProduct = plan.product || "casino";
          if (planProduct !== slot) {
            return res.status(400).json({
              error: `Plan '${plan.name}' is product=${planProduct}; cannot assign it to the ${slot} slot`,
            });
          }
          validatedSlots[slot] = plan._id;
        }
        update.commissionPlans = validatedSlots;
      }

      if (Object.keys(update).length === 0) {
        return res.status(400).json({ error: "Nothing to update" });
      }

      const profile = await AffiliateProfile.findOneAndUpdate(
        { user: req.params.affiliateId },
        { $set: update },
        { new: true },
      );

      res.json({
        ok: true,
        commissionPlanId: profile.commissionPlanId,
        commissionPlans:  profile.commissionPlans,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
};

module.exports = { planController, reportController, affiliatePlanController };
