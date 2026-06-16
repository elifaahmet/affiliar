const CommissionPlan           = require("../../models/CommissionPlan");
const CommissionReport         = require("../../models/CommissionReport");
const SubAffiliatePayout       = require("../../models/SubAffiliatePayout");
const AffiliateProfile         = require("../../models/AffiliateProfile");
const AffiliatePlayer          = require("../../models/AffiliatePlayer");
const User                     = require("../../models/User");
const OperatorFinancialSettings = require("../../models/OperatorFinancialSettings");
const clickhouse               = require("../../config/clickhouse");
const { calculate }             = require("../../engine/commissionEngine");
const { checkCpaQualification } = require("../../engine/cpaQualification");
const { checkFixedQualification } = require("../../engine/fixedQualification");
const { resolveCommissionSettings, resolveFixedSettings } = require("../../engine/commissionSettings");
const { computeSubPayout }      = require("../../engine/subAffiliatePayout");
const {
  resolveOperatorPlan, planError,
} = require("../../middlewares/planGuard");
const { firstPlanWith }         = require("../../utils/planLimits");

/**
 * Reject a plan body that tries to set a non-null minKycLevel when the
 * operator's subscription plan doesn't carry the kycGate flag. Sends the
 * 403 itself if needed; returns true when the request should keep going.
 */
async function ensureKycGatePermitted(req, res) {
  const min = req.body?.cpa?.qualification?.minKycLevel;
  if (min == null) return true; // null/undefined = "inherit", always allowed
  const resolved = await resolveOperatorPlan(req);
  if (!resolved) return true; // resolution failure handled elsewhere
  const { plan, planKey } = resolved;
  if (plan.kycGate) return true;
  res.status(403).json(
    planError(
      `The minKycLevel CPA gate is not available on the ${plan.name} plan.`,
      planKey,
      firstPlanWith((p) => p.kycGate),
    ),
  );
  return false;
}

/** Zero row with every metric the engine and roll-up needs. */
function zeroRow() {
  return {
    affiliateCode: "",
    ggrCents: 0, ngrCents: 0,
    casinoGgrCents: 0, casinoNgrCents: 0,
    sbGgrCents: 0, sbNgrCents: 0,
    combinedNgrCents: 0,
    ftdCount: 0,
    depositsCount: 0, depositsCents: 0,
    depositFeesCents: 0, withdrawalFeesCents: 0, paymentSystemFeesCents: 0,
    registrations: 0,
    playerCount: 0,
  };
}

/**
 * Sum per-affiliate rows into one rolled-up subtree row. Used so the top-
 * level affiliate's commission is calculated on their entire downline's
 * activity, not just their direct players. playerCount is summed even
 * though it's a distinct count — players reassigning across affiliates is
 * a rare edge case we accept the small double-count for.
 */
function aggregateSubtreeRow(subtreeUserIds, rowByUserId) {
  const acc = zeroRow();
  for (const uid of subtreeUserIds) {
    const r = rowByUserId.get(uid);
    if (!r) continue;
    acc.ggrCents               += r.ggrCents;
    acc.ngrCents               += r.ngrCents;
    acc.casinoGgrCents         += r.casinoGgrCents;
    acc.casinoNgrCents         += r.casinoNgrCents;
    acc.sbGgrCents             += r.sbGgrCents;
    acc.sbNgrCents             += r.sbNgrCents;
    acc.combinedNgrCents       += r.combinedNgrCents;
    acc.ftdCount               += r.ftdCount;
    acc.depositsCount          += r.depositsCount;
    acc.depositsCents          += r.depositsCents;
    acc.depositFeesCents       += r.depositFeesCents;
    acc.withdrawalFeesCents    += r.withdrawalFeesCents;
    acc.paymentSystemFeesCents += r.paymentSystemFeesCents;
    acc.registrations          += r.registrations;
    acc.playerCount            += r.playerCount;
  }
  return acc;
}

/** Helper: pick the product-scoped NGR/GGR for downstream display. */
function pickProductPair(row, product) {
  const ngr =
    product === "sportsbook" ? row.sbNgrCents
  : product === "combined"   ? row.combinedNgrCents
  :                            row.casinoNgrCents;
  const ggr =
    product === "sportsbook" ? row.sbGgrCents
  : product === "combined"   ? (row.casinoGgrCents + row.sbGgrCents)
  :                            row.casinoGgrCents;
  return { ngr, ggr };
}

// ── Sub-affiliate edge helpers ────────────────────────────────────────────────

// Normalize a profile's subPlan into an edge the payout engine consumes.
// `type` is authoritative: a revshare-only edge contributes 0 to the CPA
// bucket (and vice-versa), so a stale value left in the inactive field can't
// leak into the cascade.
function normalizeSubEdge(subPlan) {
  const sp = subPlan || {};
  const type = sp.type || "revshare";
  return {
    type,
    revshareRate:
      type === "revshare" || type === "hybrid" ? Number(sp.revshareRate) || 0 : 0,
    cpaSharePercent:
      type === "cpa" || type === "hybrid" ? Number(sp.cpaSharePercent) || 0 : 0,
  };
}

// Sub-edges strictly ABOVE `parentUserId` — walking up to (not including) the
// top-level affiliate, who has no incoming edge. Order is irrelevant; the
// payout cascade just multiplies the shares. 100-hop guard mirrors the
// hierarchy-walk cap elsewhere.
function ancestorSubEdges(parentUserId, profileByUserId) {
  const edges = [];
  let cur = parentUserId;
  for (let hops = 0; hops < 100; hops++) {
    const p = profileByUserId.get(cur);
    if (!p || !p.parentAffiliate) break; // reached the top-level affiliate
    edges.push(normalizeSubEdge(p.subPlan));
    cur = String(p.parentAffiliate);
  }
  return edges;
}

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

  // Pull each player's latest KYC level from AffiliatePlayer (Mongo) so the
  // minKycLevel CPA gate has data to compare against. Missing rows fall back
  // to 0 (unverified). Operators ship KYC updates via player.kyc.updated.
  const playerIds = Array.from(new Set(rows.map((r) => r.playerId).filter(Boolean)));
  const kycMap = new Map();
  if (playerIds.length) {
    const kycRows = await AffiliatePlayer.find({
      operatorId: tenantId,
      playerId: { $in: playerIds },
    })
      .select({ playerId: 1, kycLevel: 1 })
      .lean();
    for (const k of kycRows) kycMap.set(k.playerId, Number(k.kycLevel) || 0);
  }

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
    kycLevel:              kycMap.get(r.playerId) ?? 0,
  }));
}

/**
 * Per-player cumulative context for `fixed`-type commission plans.
 *
 * Unlike fetchFtdContextRows (which scopes FTDs to the calc period for CPA
 * semantics), this query returns EVERY player who has ever FTD'd under each
 * affiliate, with their lifetime metrics up to `endTs`. The fixed-plan
 * qualification evaluator decides which ones have newly crossed all gates
 * this period and earn the affiliate one fixed payout.
 */
async function fetchPlayerCumulativeContext(tenantId, endTs) {
  const sql = `
    WITH ftds AS (
      SELECT
        affiliate_id,
        player_id,
        MIN(from_ts)                  AS ftd_date,
        SUM(ftd_sum_cents)            AS first_deposit_cents,
        SUM(deposit_fees_sum_cents)   AS first_deposit_fees_cents
      FROM affiliate.activity
      WHERE tenant_id = {tenantId:String}
        AND ftd_count > 0
        AND from_ts <= {endTs:DateTime}
        AND player_id != '__fees__'
        AND affiliate_id != ''
      GROUP BY affiliate_id, player_id
    )
    SELECT
      f.affiliate_id                                            AS affiliateId,
      f.player_id                                               AS playerId,
      f.ftd_date                                                AS ftdDate,
      f.first_deposit_cents                                     AS firstDepositCents,
      f.first_deposit_fees_cents                                AS depositFeesCents,
      SUM(toInt64(a.deposits_count))                            AS depositsCount,
      SUM(toInt64(a.deposits_sum_cents))                        AS depositsTotalCents,
      SUM(toInt64(a.cashouts_sum_cents))                        AS cashoutsTotalCents,
      SUM(toInt64(a.bets_sum_cents)
        - toInt64(a.casino_bets_rollbacks_sum_cents))           AS wagerCents,
      SUM(toInt64(a.casino_ngr_cents)
        + toInt64(a.sb_ngr_cents))                              AS ngrCents
    FROM ftds f
    LEFT JOIN affiliate.activity a
      ON a.tenant_id = {tenantId:String}
     AND a.player_id = f.player_id
     AND a.from_ts <= {endTs:DateTime}
     AND a.player_id != '__fees__'
    GROUP BY f.affiliate_id, f.player_id, f.ftd_date,
             f.first_deposit_cents, f.first_deposit_fees_cents
  `;

  const result = await clickhouse.query({
    query: sql,
    query_params: { tenantId, endTs },
    format: "JSONEachRow",
  });
  const rows = await result.json();

  // Same KYC enrichment as the FTD context.
  const playerIds = Array.from(new Set(rows.map((r) => r.playerId).filter(Boolean)));
  const kycMap = new Map();
  if (playerIds.length) {
    const kycRows = await AffiliatePlayer.find({
      operatorId: tenantId,
      playerId: { $in: playerIds },
    })
      .select({ playerId: 1, kycLevel: 1 })
      .lean();
    for (const k of kycRows) kycMap.set(k.playerId, Number(k.kycLevel) || 0);
  }

  return rows.map((r) => ({
    affiliateId:        r.affiliateId,
    playerId:           r.playerId,
    ftdDate:            r.ftdDate,
    firstDepositCents:  Number(r.firstDepositCents)  || 0,
    depositFeesCents:   Number(r.depositFeesCents)   || 0,
    depositsCount:      Number(r.depositsCount)      || 0,
    depositsTotalCents: Math.max(0, Number(r.depositsTotalCents) || 0),
    cashoutsTotalCents: Math.max(0, Number(r.cashoutsTotalCents) || 0),
    wagerCents:         Math.max(0, Number(r.wagerCents)         || 0),
    ngrCents:           Number(r.ngrCents) || 0,
    kycLevel:           kycMap.get(r.playerId) ?? 0,
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

      // Plan-gated: a minKycLevel on the qualification block is only honored
      // on plans where kycGate is true. Setting null / leaving it off stays
      // free for every plan.
      if (!(await ensureKycGatePermitted(req, res))) return;

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

      if (!(await ensureKycGatePermitted(req, res))) return;

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

      // Per-player cumulative context — needed by `fixed`-type plans so
      // each player's lifetime metrics can be gate-evaluated against the
      // plan's qualification thresholds. The end of the calc period acts
      // as the "as of" anchor.
      const periodEnd = periodRange(y, m).toTs;
      const fixedContextRows = await fetchPlayerCumulativeContext(
        operator.operatorId.toString(),
        periodEnd,
      );
      const fixedContextByAffiliate = new Map();
      for (const f of fixedContextRows) {
        const list = fixedContextByAffiliate.get(f.affiliateId) || [];
        list.push(f);
        fixedContextByAffiliate.set(f.affiliateId, list);
      }

      // Prior fixed payouts per (affiliate, product) — the engine pays
      // each player exactly once ever for a fixed plan, so we have to
      // exclude players who already triggered the payout in any earlier
      // CommissionReport. Build the lookup once.
      const priorFixedPaid = await CommissionReport.find({
        operatorId: operator.operatorId,
        fixedPaidPlayerIds: { $exists: true, $ne: [] },
      })
        .select({ affiliateId: 1, product: 1, fixedPaidPlayerIds: 1, "period.year": 1, "period.month": 1 })
        .lean();
      const priorFixedPaidByKey = new Map(); // `${affiliateUserId}|${product}` → Set<playerId>
      for (const r of priorFixedPaid) {
        // Skip the period we're recalculating — those player IDs are
        // about to be overwritten by this calc.
        if (r.period?.year === y && r.period?.month === m) continue;
        const key = `${String(r.affiliateId)}|${r.product || "casino"}`;
        const set = priorFixedPaidByKey.get(key) || new Set();
        for (const pid of r.fixedPaidPlayerIds || []) set.add(pid);
        priorFixedPaidByKey.set(key, set);
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

      const results = {
        created: 0, updated: 0, skipped: 0,
        payoutsCreated: 0, payoutsUpdated: 0,
        failed: [],
      };

      // Build hierarchy maps once. childrenOf is keyed by parent user-id
      // string; topLevelUserIds is the set of affiliates that get paid
      // directly by the operator.
      const profileByUserId = new Map();
      const childrenOf = new Map();
      const topLevelUserIds = [];
      for (const profile of affiliateProfiles) {
        profileByUserId.set(String(profile.user), profile);
        if (profile.parentAffiliate) {
          const parentKey = String(profile.parentAffiliate);
          if (!childrenOf.has(parentKey)) childrenOf.set(parentKey, []);
          childrenOf.get(parentKey).push(String(profile.user));
        } else {
          topLevelUserIds.push(String(profile.user));
        }
      }

      // Index ClickHouse rows by User._id string for fast subtree lookup.
      const rowByUserId = new Map();
      for (const row of rows) {
        const userId =
          idMap.get(row.affiliateId) ?? idMap.get(`code:${row.affiliateCode}`);
        if (userId) rowByUserId.set(String(userId), row);
      }
      // Same for FTD context rows — rebucket by User._id so subtree pooling
      // is a straight Map lookup.
      const ftdRowsByUserId = new Map();
      for (const f of ftdContextRows) {
        const userId = idMap.get(f.affiliateId);
        if (!userId) continue;
        const key = String(userId);
        if (!ftdRowsByUserId.has(key)) ftdRowsByUserId.set(key, []);
        ftdRowsByUserId.get(key).push(f);
      }

      // Per-player cumulative rows for fixed-plan qualification, bucketed
      // by direct attribution. Subtree roll-up happens in the calc loop
      // the same way CPA's FTD rows do.
      const fixedRowsByUserId = new Map();
      for (const f of fixedContextRows) {
        const userId = idMap.get(f.affiliateId);
        if (!userId) continue;
        const key = String(userId);
        if (!fixedRowsByUserId.has(key)) fixedRowsByUserId.set(key, []);
        fixedRowsByUserId.get(key).push(f);
      }

      function getSubtreeIds(rootId) {
        const out = [rootId];
        const queue = [rootId];
        while (queue.length) {
          const cur = queue.shift();
          const kids = childrenOf.get(cur) || [];
          for (const k of kids) { out.push(k); queue.push(k); }
        }
        return out;
      }

      // ── Pass 1: top-level CommissionReports ─────────────────────────────
      // Operator pays each direct affiliate based on their plan applied to
      // the FULL subtree's activity. Sub payouts are settled internally
      // (Pass 2) and don't affect what the operator owes.
      for (const topUserId of topLevelUserIds) {
        try {
          const profile    = profileByUserId.get(topUserId);
          const subtreeIds = getSubtreeIds(topUserId);
          const subtreeRow = aggregateSubtreeRow(subtreeIds, rowByUserId);

          const hasActivity =
            subtreeRow.ngrCents !== 0 ||
            subtreeRow.combinedNgrCents !== 0 ||
            subtreeRow.ftdCount > 0 ||
            subtreeRow.depositsCount > 0;
          if (!hasActivity) continue;

          const planSlots = await resolveAffiliatePlansByProduct(
            topUserId, operator.operatorId,
          );
          const subtreeFtdRows = subtreeIds.flatMap(
            (uid) => ftdRowsByUserId.get(uid) || [],
          );
          const subtreeFixedRows = subtreeIds.flatMap(
            (uid) => fixedRowsByUserId.get(uid) || [],
          );
          const topCode = profile?.referralCodes?.[0] ?? "";

          for (const product of ["casino", "sportsbook", "combined"]) {
            const plan = planSlots[product];
            if (!plan) continue;

            const existing = await CommissionReport.findOne({
              operatorId: operator.operatorId,
              affiliateId: topUserId,
              "period.year": y,
              "period.month": m,
              product,
            });

            if (existing && ["approved", "paid"].includes(existing.status) && !force) {
              results.skipped++;
              continue;
            }

            const resolvedSettings = resolveCommissionSettings(plan, operatorDefaults);
            const qualification = checkCpaQualification(subtreeFtdRows, resolvedSettings);

            // Fixed-plan qualification — runs the per-player gate evaluator
            // against the subtree's cumulative-state rows, filtered to those
            // not already paid in a prior period.
            let fixedQual = { newlyQualified: 0, newlyQualifiedRows: [] };
            let fixedNewlyPaidPlayerIds = [];
            if (plan.type === "fixed") {
              const priorPaidSet =
                priorFixedPaidByKey.get(`${topUserId}|${product}`) || new Set();
              const fixedGates = resolveFixedSettings(plan, operatorDefaults);
              fixedQual = checkFixedQualification(
                subtreeFixedRows,
                fixedGates,
                priorPaidSet,
              );
              fixedNewlyPaidPlayerIds = fixedQual.newlyQualifiedRows.map((r) => r.playerId);
            }

            const breakdown = calculate(
              plan,
              {
                ...subtreeRow,
                qualifiedFtdCount: qualification.qualified,
                newlyQualifiedPlayerCount: fixedQual.newlyQualified,
              },
              operatorDefaults,
            );
            const planSnap = {
              _id:      plan._id,
              name:     plan.name,
              type:     plan.type,
              product:  plan.product,
              revshare: plan.revshare,
              cpa:      plan.cpa,
              fixed:    plan.fixed,
              tiers:    plan.tiers,
              resolvedSettings: breakdown.resolvedSettings,
            };
            const directCents =
              breakdown.revshareAmountCents +
              breakdown.cpaAmountCents +
              (breakdown.fixedAmountCents || 0);
            const { ngr: productNgr, ggr: productGgr } = pickProductPair(subtreeRow, product);

            const metrics = {
              ggrCents:          productGgr,
              ngrCents:          productNgr,
              ftdCount:          subtreeRow.ftdCount,
              qualifiedFtdCount: qualification.qualified,
              pendingFtdCount:   qualification.pending,
              rejectedFtdCount:  qualification.rejected,
              newlyQualifiedPlayerCount: fixedQual.newlyQualified,
              depositsCount:     subtreeRow.depositsCount,
              depositsCents:     subtreeRow.depositsCents,
              playerCount:       subtreeRow.playerCount,
              registrations:     subtreeRow.registrations,
            };
            const ftdQualification = [
              ...qualification.qualifiedFtds.map((f) => ({ ...f, status: "qualified" })),
              ...qualification.pendingFtds.map((f)   => ({ ...f, status: "pending" })),
              ...qualification.rejectedFtds.map((f)  => ({ ...f, status: "rejected" })),
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
              overrideCents: 0,
              totalCents:    directCents,
            };

            if (existing) {
              await CommissionReport.updateOne(
                { _id: existing._id },
                {
                  $set: {
                    affiliateCode: topCode,
                    planId:        plan._id,
                    planSnapshot:  planSnap,
                    metrics,
                    ftdQualification,
                    breakdown:        fullBreakdown,
                    overrideFromSubs: [],
                    fixedPaidPlayerIds: fixedNewlyPaidPlayerIds,
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
                affiliateId:   topUserId,
                affiliateCode: topCode,
                planId:        plan._id,
                planSnapshot:  planSnap,
                period:        { year: y, month: m },
                product,
                metrics,
                ftdQualification,
                breakdown:        fullBreakdown,
                overrideFromSubs: [],
                fixedPaidPlayerIds: fixedNewlyPaidPlayerIds,
                status:        "draft",
                calculatedAt:  new Date(),
              });
              results.created++;
            }
          }
        } catch (err) {
          results.failed.push({ affiliateId: topUserId, error: err.message });
        }
      }

      // ── Pass 2: SubAffiliatePayouts ────────────────────────────────────
      // One row per parent → direct-child edge per period per product. The
      // subPlan on the child's profile (set by the parent) drives the math
      // applied to the child's whole subtree. No cascading earnings math —
      // each edge is independent; each parent decides how to compensate
      // their own subs.
      for (const profile of affiliateProfiles) {
        if (!profile.parentAffiliate) continue;

        try {
          const subUserId    = String(profile.user);
          const parentUserId = String(profile.parentAffiliate);
          const subtreeIds   = getSubtreeIds(subUserId);
          const subtreeRow   = aggregateSubtreeRow(subtreeIds, rowByUserId);

          const hasActivity =
            subtreeRow.ngrCents !== 0 ||
            subtreeRow.combinedNgrCents !== 0 ||
            subtreeRow.ftdCount > 0;
          if (!hasActivity) continue;

          const subPlan = profile.subPlan || {
            type: "revshare", revshareRate: 0, cpaSharePercent: 0,
          };

          // CPA qualification gates come from the top-level plan (operator
          // sets these; subs don't override). Walk up to the root to find
          // the plan owner.
          let topAncestorId = parentUserId;
          while (true) {
            const p = profileByUserId.get(topAncestorId);
            if (!p?.parentAffiliate) break;
            topAncestorId = String(p.parentAffiliate);
          }
          const planSlots = await resolveAffiliatePlansByProduct(
            topAncestorId, operator.operatorId,
          );
          const subtreeFtdRows = subtreeIds.flatMap(
            (uid) => ftdRowsByUserId.get(uid) || [],
          );

          for (const product of ["casino", "sportsbook", "combined"]) {
            const plan = planSlots[product];
            // No top-level plan for this product → operator isn't paying
            // the chain for it, so the parent has no earnings on it to
            // share. Without this gate, a legacy plan that lands in the
            // casino slot still spawns a duplicate combined-product row
            // because combined NGR == casino NGR + sb NGR.
            if (!plan) continue;
            const resolvedSettings = resolveCommissionSettings(plan, operatorDefaults);
            const qualification = checkCpaQualification(subtreeFtdRows, resolvedSettings);
            const { ngr: productNgr, ggr: productGgr } = pickProductPair(subtreeRow, product);

            // Operator-plan commission on THIS sub's subtree — the money the
            // chain above the sub collectively earns from the sub's players.
            const opBreakdown = calculate(
              plan,
              { ...subtreeRow, qualifiedFtdCount: qualification.qualified },
              operatorDefaults,
            );
            // Cascade it down every edge from the top-level affiliate to this
            // sub — share-of-parent model. See engine/subAffiliatePayout.js.
            const {
              revshareAmountCents, cpaAmountCents, payableCents,
              basisRevshareCents, basisCpaCents,
            } = computeSubPayout({
              opRevshareCents: opBreakdown.revshareAmountCents,
              opCpaCents:      opBreakdown.cpaAmountCents,
              ancestorEdges:   ancestorSubEdges(parentUserId, profileByUserId),
              ownEdge:         normalizeSubEdge(subPlan),
            });

            const existing = await SubAffiliatePayout.findOne({
              operatorId: operator.operatorId,
              parentId: parentUserId,
              subId:    subUserId,
              "period.year":  y,
              "period.month": m,
              product,
            });

            // Skip empty edges to keep the collection lean, but still
            // overwrite an existing row to 0 if the math went to 0 after
            // a recalc.
            if (!existing && payableCents === 0) continue;
            if (existing && existing.status === "paid" && !force) {
              results.skipped++;
              continue;
            }

            const snapshot = {
              type:            subPlan.type,
              revshareRate:    subPlan.revshareRate    || 0,
              cpaSharePercent: subPlan.cpaSharePercent || 0,
            };
            const subtreeMetrics = {
              ngrCents:          productNgr,
              ggrCents:          productGgr,
              ftdCount:          subtreeRow.ftdCount,
              qualifiedFtdCount: qualification.qualified,
              registrations:     subtreeRow.registrations,
              depositsCents:     subtreeRow.depositsCents,
              playerCount:       subtreeRow.playerCount,
            };

            if (existing) {
              existing.subtreeMetrics      = subtreeMetrics;
              existing.subPlanSnapshot     = snapshot;
              existing.basisRevshareCents  = basisRevshareCents;
              existing.basisCpaCents       = basisCpaCents;
              existing.revshareAmountCents = revshareAmountCents;
              existing.cpaAmountCents      = cpaAmountCents;
              existing.payableCents        = payableCents;
              existing.status              = "draft";
              existing.calculatedAt        = new Date();
              existing.paidAt              = null;
              await existing.save();
              results.payoutsUpdated++;
            } else {
              await SubAffiliatePayout.create({
                operatorId: operator.operatorId,
                parentId:   parentUserId,
                subId:      subUserId,
                period:     { year: y, month: m },
                product,
                subtreeMetrics,
                subPlanSnapshot: snapshot,
                basisRevshareCents,
                basisCpaCents,
                revshareAmountCents,
                cpaAmountCents,
                payableCents,
                status: "draft",
                calculatedAt: new Date(),
              });
              results.payoutsCreated++;
            }
          }
        } catch (err) {
          results.failed.push({
            affiliateId: String(profile.user),
            error: `Sub payout calc failed: ${err.message}`,
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

      // Sub-affiliates earn via the share-of-parent-commission cascade
      // (their parent's CommissionPlan applied to the sub's subtree
      // metrics, scaled by `subPlan.revshareRate` / `cpaSharePercent`
      // configured by the parent). Operators don't assign separate plans
      // to sub-affiliates — that would double-count or contradict the
      // cascade. Plan editing for subs lives on the parent's
      // /affiliate/sub-affiliates page.
      if (existingProfile.parentAffiliate) {
        return res.status(403).json({
          error: "sub_affiliate_plans_managed_by_parent",
          message:
            "Sub-affiliates are paid via the parent's commission plan + share rate. Their parent affiliate edits this on the Sub-Affiliates page.",
        });
      }

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

// ── Portal-side recompute: a parent affiliate refreshes the SubAffiliatePayout
// rows that they own (caller + descendants are the allowed parent IDs). Skips
// the CommissionReport pass entirely — that ledger stays the operator's.
async function recalculateSubtreePayouts(req, res) {
  try {
    const affiliate = req.affiliateUser;
    if (affiliate.role !== "affiliate") {
      return res.status(403).json({ error: "Affiliates only" });
    }
    if (!affiliate.operatorId) {
      return res.status(400).json({ error: "Affiliate not linked to an operator" });
    }

    const now = new Date();
    const y = Number(req.body?.year)  || now.getUTCFullYear();
    const m = Number(req.body?.month) || (now.getUTCMonth() + 1);
    if (m < 1 || m > 12) return res.status(400).json({ error: "month must be 1-12" });
    const force = !!req.body?.force;

    const { getDescendantIds } = require("../../utils/affiliateHierarchy");

    const callerProfile = await AffiliateProfile.findOne({ user: affiliate._id })
      .select("operatorUser").lean();
    if (!callerProfile?.operatorUser) {
      return res.status(400).json({ error: "Affiliate profile missing operatorUser" });
    }

    const callerSubtree = new Set([
      String(affiliate._id),
      ...await getDescendantIds(affiliate._id),
    ]);

    const affiliateProfiles = await AffiliateProfile.find({
      operatorUser: callerProfile.operatorUser,
    }).lean();

    const operatorFinancials = await OperatorFinancialSettings.findOne({
      operatorId: affiliate.operatorId,
      brandId: null,
    }).lean();
    const operatorDefaults = operatorFinancials?.defaults || {};

    const rows = await fetchAffiliateMetrics(affiliate.operatorId.toString(), y, m);
    const ftdContextRows = await fetchFtdContextRows(affiliate.operatorId.toString(), y, m);

    const profileByUserId = new Map();
    const childrenOf = new Map();
    const idMap = new Map();
    for (const profile of affiliateProfiles) {
      profileByUserId.set(String(profile.user), profile);
      if (profile.user) idMap.set(String(profile.user), profile.user);
      for (const code of profile.referralCodes ?? []) {
        idMap.set(`code:${code}`, profile.user);
      }
      if (profile.parentAffiliate) {
        const parentKey = String(profile.parentAffiliate);
        if (!childrenOf.has(parentKey)) childrenOf.set(parentKey, []);
        childrenOf.get(parentKey).push(String(profile.user));
      }
    }

    const rowByUserId = new Map();
    for (const row of rows) {
      const userId = idMap.get(row.affiliateId) ?? idMap.get(`code:${row.affiliateCode}`);
      if (userId) rowByUserId.set(String(userId), row);
    }
    const ftdRowsByUserId = new Map();
    for (const f of ftdContextRows) {
      const userId = idMap.get(f.affiliateId);
      if (!userId) continue;
      const key = String(userId);
      if (!ftdRowsByUserId.has(key)) ftdRowsByUserId.set(key, []);
      ftdRowsByUserId.get(key).push(f);
    }

    function getSubtreeIdsLocal(rootId) {
      const out = [rootId];
      const queue = [rootId];
      while (queue.length) {
        const cur = queue.shift();
        const kids = childrenOf.get(cur) || [];
        for (const k of kids) { out.push(k); queue.push(k); }
      }
      return out;
    }

    const results = { payoutsCreated: 0, payoutsUpdated: 0, skipped: 0, failed: [] };

    for (const profile of affiliateProfiles) {
      if (!profile.parentAffiliate) continue;
      const parentUserId = String(profile.parentAffiliate);
      if (!callerSubtree.has(parentUserId)) continue;

      try {
        const subUserId  = String(profile.user);
        const subtreeIds = getSubtreeIdsLocal(subUserId);
        const subtreeRow = aggregateSubtreeRow(subtreeIds, rowByUserId);

        const hasActivity =
          subtreeRow.ngrCents !== 0 ||
          subtreeRow.combinedNgrCents !== 0 ||
          subtreeRow.ftdCount > 0;
        if (!hasActivity) continue;

        const subPlan = profile.subPlan || { type: "revshare", revshareRate: 0, cpaSharePercent: 0 };

        let topAncestorId = parentUserId;
        while (true) {
          const p = profileByUserId.get(topAncestorId);
          if (!p?.parentAffiliate) break;
          topAncestorId = String(p.parentAffiliate);
        }
        const planSlots = await resolveAffiliatePlansByProduct(topAncestorId, affiliate.operatorId);
        const subtreeFtdRows = subtreeIds.flatMap((uid) => ftdRowsByUserId.get(uid) || []);

        for (const product of ["casino", "sportsbook", "combined"]) {
          const plan = planSlots[product];
          if (!plan) continue;
          const resolvedSettings = resolveCommissionSettings(plan, operatorDefaults);
          const qualification = checkCpaQualification(subtreeFtdRows, resolvedSettings);
          const { ngr: productNgr, ggr: productGgr } = pickProductPair(subtreeRow, product);

          // Operator-plan commission on this sub's subtree, cascaded down
          // every edge to the sub — share-of-parent model. See
          // engine/subAffiliatePayout.js.
          const opBreakdown = calculate(
            plan,
            { ...subtreeRow, qualifiedFtdCount: qualification.qualified },
            operatorDefaults,
          );
          const {
            revshareAmountCents, cpaAmountCents, payableCents,
            basisRevshareCents, basisCpaCents,
          } = computeSubPayout({
            opRevshareCents: opBreakdown.revshareAmountCents,
            opCpaCents:      opBreakdown.cpaAmountCents,
            ancestorEdges:   ancestorSubEdges(parentUserId, profileByUserId),
            ownEdge:         normalizeSubEdge(subPlan),
          });

          const existing = await SubAffiliatePayout.findOne({
            operatorId: affiliate.operatorId,
            parentId:   parentUserId,
            subId:      subUserId,
            "period.year":  y,
            "period.month": m,
            product,
          });

          if (!existing && payableCents === 0) continue;
          if (existing && existing.status === "paid" && !force) {
            results.skipped++;
            continue;
          }

          const snapshot = {
            type:            subPlan.type,
            revshareRate:    subPlan.revshareRate    || 0,
            cpaSharePercent: subPlan.cpaSharePercent || 0,
          };
          const subtreeMetrics = {
            ngrCents:          productNgr,
            ggrCents:          productGgr,
            ftdCount:          subtreeRow.ftdCount,
            qualifiedFtdCount: qualification.qualified,
            registrations:     subtreeRow.registrations,
            depositsCents:     subtreeRow.depositsCents,
            playerCount:       subtreeRow.playerCount,
          };

          if (existing) {
            existing.subtreeMetrics      = subtreeMetrics;
            existing.subPlanSnapshot     = snapshot;
            existing.basisRevshareCents  = basisRevshareCents;
            existing.basisCpaCents       = basisCpaCents;
            existing.revshareAmountCents = revshareAmountCents;
            existing.cpaAmountCents      = cpaAmountCents;
            existing.payableCents        = payableCents;
            existing.status              = "draft";
            existing.calculatedAt        = new Date();
            existing.paidAt              = null;
            await existing.save();
            results.payoutsUpdated++;
          } else {
            await SubAffiliatePayout.create({
              operatorId: affiliate.operatorId,
              parentId:   parentUserId,
              subId:      subUserId,
              period:     { year: y, month: m },
              product,
              subtreeMetrics,
              subPlanSnapshot: snapshot,
              basisRevshareCents,
              basisCpaCents,
              revshareAmountCents,
              cpaAmountCents,
              payableCents,
              status: "draft",
              calculatedAt: new Date(),
            });
            results.payoutsCreated++;
          }
        }
      } catch (err) {
        results.failed.push({
          affiliateId: String(profile.user),
          error: err.message,
        });
      }
    }

    res.json({ period: { year: y, month: m }, ...results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { planController, reportController, affiliatePlanController, recalculateSubtreePayouts };
