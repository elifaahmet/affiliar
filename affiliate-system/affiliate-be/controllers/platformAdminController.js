"use strict";

const Operator                  = require("../models/Operator");
const User                      = require("../models/User");
const Brand                     = require("../models/Brand");
const OperatorFinancialSettings = require("../models/OperatorFinancialSettings");
const DiscountCode              = require("../models/DiscountCode");
const BillingTransaction        = require("../models/BillingTransaction");
const CommissionPlan            = require("../models/CommissionPlan");
const { PLAN_ORDER }            = require("../utils/planLimits");
const { sendOperatorInvite }    = require("../utils/mailer");
const { logger }                = require("../middlewares/logger");

// POST /admin/operators
// Hexium-internal onboarding. Creates the Operator doc, an owner User in
// `pending` status (activates via /auth/activate to set their password),
// and an empty OperatorFinancialSettings row so the fees UI renders without
// zeros on the first visit. Brands and additional users are attached
// afterwards via the per-operator admin sub-endpoints — keeping the create
// step minimal avoids the half-created orphan failure mode where one
// dependent insert blows up the whole flow. Optionally pre-attaches a
// discount code (e.g. negotiated BETAMERICANO200) so first checkout
// already has the deal applied.
exports.createOperator = async (req, res) => {
  try {
    const {
      name,
      ownerEmail,
      ownerName,
      ownerUsername,
      plan = "tier1",
      activeDiscountCode = "",
      mode = "pay_now",
    } = req.body || {};

    if (!name || !ownerEmail || !ownerName || !ownerUsername) {
      return res.status(400).json({
        error: "name, ownerEmail, ownerName, ownerUsername are required",
      });
    }
    if (!PLAN_ORDER.includes(plan)) {
      return res.status(400).json({
        error: `plan must be one of: ${PLAN_ORDER.join(", ")}`,
      });
    }
    if (mode !== "pay_now" && mode !== "trial") {
      return res.status(400).json({ error: "mode must be 'pay_now' or 'trial'" });
    }

    // Reject duplicate owner accounts early so we don't half-create the
    // Operator doc and orphan it.
    const existingUser = await User.findOne({
      $or: [
        { email: ownerEmail.toLowerCase() },
        { username: ownerUsername },
      ],
      isDeleted: false,
    });
    if (existingUser) {
      return res.status(409).json({ error: "Owner email or username already taken" });
    }

    // Validate the discount code if provided so the operator doesn't land
    // on billing with a sticky code that immediately errors.
    let resolvedDiscountCode = "";
    if (activeDiscountCode) {
      const resolved = await DiscountCode.resolve(activeDiscountCode);
      if (!resolved.ok) {
        return res.status(400).json({ error: `Discount code: ${resolved.error}` });
      }
      resolvedDiscountCode = resolved.code.code;
    }

    // Next id is global (Operator.id is the human-readable numeric id used in
    // legacy queries). Pick the max across all operators + 1.
    const last = await Operator.findOne({}).sort({ id: -1 }).select({ id: 1 }).lean();
    const nextId = (last?.id ?? 0) + 1;

    // Two onboarding flavours:
    //   pay_now (default) — operator has a deal in place, starts in
    //                       past_due with nextBillingDate=now so the
    //                       billing banner shows "Pay now" on first login.
    //   trial             — 3-day grace: nextBillingDate=trialEndsAt so the
    //                       billing job fires due_today on day 3, +2/+4
    //                       overdue reminders on days 5/7, and suspends on
    //                       day 10. The first successful charge flips to
    //                       active either way.
    const now = new Date();
    const trialMode = mode === "trial";
    const trialEndsAt = trialMode
      ? new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
      : null;
    const operator = await Operator.create({
      id: nextId,
      name: name.trim(),
      plan,
      billingStatus: trialMode ? "trial" : "past_due",
      pastDueAt: trialMode ? null : now,
      nextBillingDate: trialMode ? trialEndsAt : now,
      trialEndsAt,
      activeDiscountCode: resolvedDiscountCode,
    });

    const ownerUser = await User.create({
      email: ownerEmail.toLowerCase().trim(),
      username: ownerUsername.trim(),
      name: ownerName.trim(),
      password: "PENDING", // unusable until /auth/activate sets it
      role: "operator",
      status: "pending",
      operatorId: operator._id,
      isDeleted: false,
    });

    // Empty defaults row so the Fees admin page renders with real values
    // (zeros, until the operator edits) rather than no document at all.
    // Brand-clone helper will copy this onto any future brand.
    await OperatorFinancialSettings.create({
      operatorId: operator._id,
      brandId: null,
    });

    // Non-blocking: don't fail the create if SMTP is misconfigured.
    sendOperatorInvite({
      to: ownerUser.email,
      name: ownerUser.name,
      userId: ownerUser._id.toString(),
      operatorName: operator.name,
      planName: plan,
    }).catch((err) => {
      logger.error("operator.invite.mail_failed", { error: err?.message });
    });

    return res.status(201).json({
      operator: {
        _id: String(operator._id),
        id: operator.id,
        name: operator.name,
        plan: operator.plan,
        billingStatus: operator.billingStatus,
        activeDiscountCode: operator.activeDiscountCode,
      },
      owner: {
        _id: String(ownerUser._id),
        email: ownerUser.email,
        name: ownerUser.name,
        status: ownerUser.status,
      },
      activationUrl: `${process.env.APP_URL || ""}/activate?userId=${ownerUser._id}`,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// GET /admin/operators?q=<text>
// Hexium-internal list. Returns every operator + their owner user(s) so the
// admin UI can show a quick directory. Optional `q` filters by operator
// name OR any owner-user email/username/name (case-insensitive substring).
exports.listOperators = async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();

    // Build the base operator query, then narrow with an owner-side OR if
    // there's a search term. We resolve the owner match first so we can OR
    // operator-name with operator-id-in-owner-hits in a single Operator
    // query (cheap, even with hundreds of operators).
    const baseFilter = { isDeleted: { $ne: true } };
    let filter = baseFilter;
    if (q) {
      const safe = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const rx = new RegExp(safe, "i");
      const matchedOwners = await User.find({
        role: "operator",
        isDeleted: { $ne: true },
        $or: [{ email: rx }, { username: rx }, { name: rx }],
      })
        .select({ operatorId: 1 })
        .lean();
      const ownerOperatorIds = matchedOwners.map((u) => u.operatorId).filter(Boolean);
      filter = {
        ...baseFilter,
        $or: [{ name: rx }, { _id: { $in: ownerOperatorIds } }],
      };
    }

    const operators = await Operator.find(filter)
      .sort({ createdAt: -1 })
      .lean();

    const operatorIds = operators.map((o) => o._id);
    const owners = await User.find({
      operatorId: { $in: operatorIds },
      role: "operator",
      isDeleted: { $ne: true },
    })
      .select("email name status operatorId")
      .lean();
    const ownersByOp = new Map();
    for (const u of owners) {
      const key = String(u.operatorId);
      if (!ownersByOp.has(key)) ownersByOp.set(key, []);
      ownersByOp.get(key).push(u);
    }

    return res.json({
      operators: operators.map((o) => ({
        _id: String(o._id),
        id: o.id,
        name: o.name,
        plan: o.plan,
        billingStatus: o.billingStatus,
        nextBillingDate: o.nextBillingDate,
        trialEndsAt: o.trialEndsAt,
        activeDiscountCode: o.activeDiscountCode || "",
        owners: ownersByOp.get(String(o._id)) || [],
        createdAt: o.createdAt,
      })),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// ── Helpers ──────────────────────────────────────────────────────────────────

async function loadOperatorOr404(req, res) {
  const op = await Operator.findById(req.params.id).lean();
  if (!op || op.isDeleted) {
    res.status(404).json({ error: "Operator not found" });
    return null;
  }
  return op;
}

// ── Operator detail / update ─────────────────────────────────────────────────

// GET /admin/operators/:id
// Single operator + owner users + brands + a few aggregate counts so the
// detail page can render its header in one fetch.
exports.getOperator = async (req, res) => {
  try {
    const operator = await loadOperatorOr404(req, res);
    if (!operator) return;

    const owners = await User.find({
      operatorId: operator._id,
      role: "operator",
      isDeleted: { $ne: true },
    })
      .select("email name username status createdAt")
      .lean();

    const brands = await Brand.find({ operatorId: operator._id })
      .select("id name url enabled createdAt operatorId")
      .sort({ id: 1 })
      .lean();

    const [affiliateCount, transactionCount] = await Promise.all([
      User.countDocuments({
        operatorId: operator._id,
        role: "affiliate",
        isDeleted: { $ne: true },
      }),
      BillingTransaction.countDocuments({ operatorId: operator._id }),
    ]);

    return res.json({
      operator: {
        _id: String(operator._id),
        id: operator.id,
        name: operator.name,
        plan: operator.plan,
        billingStatus: operator.billingStatus,
        activeDiscountCode: operator.activeDiscountCode || "",
        billingCycle: operator.billingCycle,
        nextBillingDate: operator.nextBillingDate,
        trialEndsAt: operator.trialEndsAt,
        pastDueAt: operator.pastDueAt,
        affiliatePayoutSettings: operator.affiliatePayoutSettings || {
          minPayoutCents: 0,
          currency: "USD",
        },
        featureOverrides: operator.featureOverrides || {},
        createdAt: operator.createdAt,
        updatedAt: operator.updatedAt,
      },
      owners: owners.map((u) => ({
        _id: String(u._id),
        email: u.email,
        name: u.name,
        username: u.username,
        status: u.status,
        createdAt: u.createdAt,
      })),
      brands: brands.map((b) => ({
        _id: String(b._id),
        id: b.id,
        name: b.name,
        url: b.url,
        enabled: b.enabled,
        createdAt: b.createdAt,
      })),
      counts: { affiliates: affiliateCount, transactions: transactionCount },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// PATCH /admin/operators/:id
// Whitelisted update: name, plan, activeDiscountCode, billingStatus,
// featureOverrides, affiliatePayoutSettings, nextBillingDate. The platform
// admin uses this to flip plans, attach/remove sticky discount codes,
// suspend/restore, and grant per-operator feature flag overrides.
exports.updateOperator = async (req, res) => {
  try {
    const operator = await loadOperatorOr404(req, res);
    if (!operator) return;

    const allowed = [
      "name",
      "plan",
      "activeDiscountCode",
      "billingStatus",
      "featureOverrides",
      "affiliatePayoutSettings",
      "nextBillingDate",
    ];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    if (updates.plan && !PLAN_ORDER.includes(updates.plan)) {
      return res.status(400).json({
        error: `plan must be one of: ${PLAN_ORDER.join(", ")}`,
      });
    }
    if (
      updates.billingStatus &&
      !["trial", "active", "past_due", "suspended", "cancelled"].includes(
        updates.billingStatus,
      )
    ) {
      return res.status(400).json({ error: "Invalid billingStatus" });
    }
    // Resolve discount code if changed — same validation as the create
    // flow so a typoed code can't be saved.
    if (
      typeof updates.activeDiscountCode === "string" &&
      updates.activeDiscountCode.trim() !== ""
    ) {
      const resolved = await DiscountCode.resolve(updates.activeDiscountCode);
      if (!resolved.ok) {
        return res.status(400).json({ error: `Discount code: ${resolved.error}` });
      }
      updates.activeDiscountCode = resolved.code.code;
    }
    if (updates.name) updates.name = String(updates.name).trim();
    if (updates.nextBillingDate) {
      const d = new Date(updates.nextBillingDate);
      if (Number.isNaN(d.getTime())) {
        return res.status(400).json({ error: "Invalid nextBillingDate" });
      }
      updates.nextBillingDate = d;
    }

    const next = await Operator.findByIdAndUpdate(operator._id, updates, {
      new: true,
    }).lean();
    logger.info("platform_admin.operator.updated", {
      operatorId: String(operator._id),
      keys: Object.keys(updates),
      by: String(req.affiliateUser?._id || ""),
    });
    return res.json({ operator: next });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// ── Brand sub-endpoints ──────────────────────────────────────────────────────

// GET /admin/operators/:id/brands
exports.listOperatorBrands = async (req, res) => {
  try {
    const operator = await loadOperatorOr404(req, res);
    if (!operator) return;
    const brands = await Brand.find({ operatorId: operator._id })
      .sort({ id: 1 })
      .lean();
    return res.json({ brands });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// POST /admin/operators/:id/brands
exports.createOperatorBrand = async (req, res) => {
  try {
    const operator = await loadOperatorOr404(req, res);
    if (!operator) return;

    const { name, url } = req.body || {};
    if (!name) return res.status(400).json({ error: "name is required" });

    // Brand.id is GLOBALLY unique.
    const last = await Brand.findOne({}).sort({ id: -1 }).select({ id: 1 }).lean();
    const nextId = (last?.id ?? 0) + 1;

    const brand = await Brand.create({
      id: nextId,
      name: String(name).trim(),
      url: url ? String(url).trim() : null,
      enabled: true,
      operatorId: operator._id,
    });
    return res.status(201).json({ brand });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// PATCH /admin/operators/:id/brands/:brandId
exports.updateOperatorBrand = async (req, res) => {
  try {
    const operator = await loadOperatorOr404(req, res);
    if (!operator) return;

    const brand = await Brand.findOne({
      _id: req.params.brandId,
      operatorId: operator._id,
    });
    if (!brand) return res.status(404).json({ error: "Brand not found" });

    const allowed = ["name", "url", "enabled"];
    for (const key of allowed) {
      if (req.body[key] !== undefined) brand[key] = req.body[key];
    }
    if (typeof brand.name === "string") brand.name = brand.name.trim();
    if (typeof brand.url === "string") brand.url = brand.url.trim() || null;
    await brand.save();
    return res.json({ brand });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// ── User sub-endpoints ───────────────────────────────────────────────────────

// GET /admin/operators/:id/users
exports.listOperatorUsers = async (req, res) => {
  try {
    const operator = await loadOperatorOr404(req, res);
    if (!operator) return;
    const users = await User.find({
      operatorId: operator._id,
      role: "operator",
      isDeleted: { $ne: true },
    })
      .select("email name username status createdAt")
      .sort({ createdAt: 1 })
      .lean();
    return res.json({ users });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// POST /admin/operators/:id/users
// Add an additional operator-role user under this operator. Same pending →
// activation-email flow as the original owner so the new account holder
// can set their own password.
exports.createOperatorUser = async (req, res) => {
  try {
    const operator = await loadOperatorOr404(req, res);
    if (!operator) return;

    const { email, name, username } = req.body || {};
    if (!email || !name || !username) {
      return res.status(400).json({ error: "email, name, username are required" });
    }

    const existing = await User.findOne({
      $or: [{ email: email.toLowerCase().trim() }, { username: username.trim() }],
      isDeleted: false,
    });
    if (existing) {
      return res.status(409).json({ error: "Email or username already taken" });
    }

    const newUser = await User.create({
      email: email.toLowerCase().trim(),
      username: username.trim(),
      name: name.trim(),
      password: "PENDING",
      role: "operator",
      status: "pending",
      operatorId: operator._id,
      isDeleted: false,
    });

    sendOperatorInvite({
      to: newUser.email,
      name: newUser.name,
      userId: newUser._id.toString(),
      operatorName: operator.name,
      planName: operator.plan,
    }).catch((err) => {
      logger.error("platform_admin.operator_user_invite.mail_failed", {
        error: err?.message,
      });
    });

    return res.status(201).json({
      user: {
        _id: String(newUser._id),
        email: newUser.email,
        username: newUser.username,
        name: newUser.name,
        status: newUser.status,
      },
      activationUrl: `${process.env.APP_URL || ""}/activate?userId=${newUser._id}`,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// ── Read-only operator-side mirrors ──────────────────────────────────────────

// GET /admin/operators/:id/affiliates
// Read-only list of all affiliate-role users under this operator, with
// parent + sub-affiliate counts for the directory view.
exports.listOperatorAffiliates = async (req, res) => {
  try {
    const operator = await loadOperatorOr404(req, res);
    if (!operator) return;
    const affiliates = await User.find({
      operatorId: operator._id,
      role: "affiliate",
      isDeleted: { $ne: true },
    })
      .select("email name username status parentAffiliateId createdAt")
      .sort({ createdAt: -1 })
      .lean();

    // Cheap sub-affiliate counts so the directory can show a "+N subs" badge.
    const subCounts = await User.aggregate([
      {
        $match: {
          operatorId: operator._id,
          role: "affiliate",
          isDeleted: { $ne: true },
          parentAffiliateId: { $ne: null },
        },
      },
      { $group: { _id: "$parentAffiliateId", n: { $sum: 1 } } },
    ]);
    const subCountByParent = new Map(
      subCounts.map((row) => [String(row._id), row.n]),
    );

    return res.json({
      affiliates: affiliates.map((a) => ({
        _id: String(a._id),
        email: a.email,
        name: a.name,
        username: a.username,
        status: a.status,
        parentAffiliateId: a.parentAffiliateId ? String(a.parentAffiliateId) : null,
        subAffiliateCount: subCountByParent.get(String(a._id)) || 0,
        createdAt: a.createdAt,
      })),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// GET /admin/operators/:id/billing
// Recent billing transactions + the operator's current billing snapshot.
// Mirrors what the operator sees on their own /billing page so the admin
// can debug payment issues without having to log in as them.
exports.getOperatorBilling = async (req, res) => {
  try {
    const operator = await loadOperatorOr404(req, res);
    if (!operator) return;

    const transactions = await BillingTransaction.find({
      operatorId: operator._id,
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    return res.json({
      billingStatus: operator.billingStatus,
      plan: operator.plan,
      billingCycle: operator.billingCycle,
      nextBillingDate: operator.nextBillingDate,
      trialEndsAt: operator.trialEndsAt,
      pastDueAt: operator.pastDueAt,
      activeDiscountCode: operator.activeDiscountCode || "",
      transactions,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// GET /admin/operators/:id/commission-plans
exports.listOperatorCommissionPlans = async (req, res) => {
  try {
    const operator = await loadOperatorOr404(req, res);
    if (!operator) return;
    const plans = await CommissionPlan.find({ operatorId: operator._id })
      .sort({ isDefault: -1, createdAt: -1 })
      .lean();
    return res.json({ plans });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// ── Cross-operator brand directory ───────────────────────────────────────────

// GET /admin/brands?q=<text>
// Flat list of every brand across operators with an optional name/url
// filter. Brand.operatorId now references Operator._id directly, so the
// tenant lookup is a single hop.
exports.listAllBrands = async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const brandFilter = {};
    if (q) {
      const safe = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const rx = new RegExp(safe, "i");
      brandFilter.$or = [{ name: rx }, { url: rx }];
    }

    const brands = await Brand.find(brandFilter).sort({ createdAt: -1 }).lean();

    const operatorIds = [...new Set(brands.map((b) => String(b.operatorId)))];
    const operators = await Operator.find({ _id: { $in: operatorIds } })
      .select({ _id: 1, id: 1, name: 1 })
      .lean();
    const operatorById = new Map(operators.map((o) => [String(o._id), o]));

    return res.json({
      brands: brands.map((b) => {
        const op = operatorById.get(String(b.operatorId));
        return {
          _id: String(b._id),
          id: b.id,
          name: b.name,
          url: b.url,
          enabled: b.enabled,
          createdAt: b.createdAt,
          operator: op
            ? { _id: String(op._id), id: op.id, name: op.name }
            : null,
        };
      }),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
