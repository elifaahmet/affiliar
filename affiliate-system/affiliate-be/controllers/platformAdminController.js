"use strict";

const Operator                  = require("../models/Operator");
const User                      = require("../models/User");
const Brand                     = require("../models/Brand");
const OperatorFinancialSettings = require("../models/OperatorFinancialSettings");
const DiscountCode              = require("../models/DiscountCode");
const BillingTransaction        = require("../models/BillingTransaction");
const CommissionPlan            = require("../models/CommissionPlan");
const AffiliatePayout           = require("../models/AffiliatePayout");
const clickhouse                = require("../config/clickhouse");
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

    // Return both active and soft-deleted accounts so the detail header
    // counts match the Users tab (which lists removed accounts inline with
    // a Deleted badge).
    const owners = await User.find({
      operatorId: operator._id,
      role: "operator",
    })
      .select("email name username status createdAt isDeleted")
      .lean();

    const brands = await Brand.find({ operatorId: operator._id })
      .select("id name url enabled products createdAt operatorId")
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
        isDeleted: !!u.isDeleted,
      })),
      brands: brands.map((b) => ({
        _id: String(b._id),
        id: b.id,
        name: b.name,
        url: b.url,
        enabled: b.enabled,
        products: Array.isArray(b.products) && b.products.length
          ? b.products
          : ["casino", "sportsbook"],
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

// Whitelist a brand-products array against the model's enum so a stray
// value can't sneak into Mongo. Returns null when the input wasn't
// provided so callers can leave the field untouched in PATCH paths.
function sanitizeProducts(input) {
  if (input === undefined) return null;
  if (!Array.isArray(input)) return [];
  const set = new Set(
    input
      .map((p) => String(p).trim().toLowerCase())
      .filter((p) => p === "casino" || p === "sportsbook"),
  );
  return [...set];
}

// POST /admin/operators/:id/brands
exports.createOperatorBrand = async (req, res) => {
  try {
    const operator = await loadOperatorOr404(req, res);
    if (!operator) return;

    const { name, url } = req.body || {};
    if (!name) return res.status(400).json({ error: "name is required" });

    const products = sanitizeProducts(req.body?.products);
    if (products && products.length === 0) {
      return res.status(400).json({ error: "products must include at least one of: casino, sportsbook" });
    }

    // Brand.id is GLOBALLY unique.
    const last = await Brand.findOne({}).sort({ id: -1 }).select({ id: 1 }).lean();
    const nextId = (last?.id ?? 0) + 1;

    const brand = await Brand.create({
      id: nextId,
      name: String(name).trim(),
      url: url ? String(url).trim() : null,
      enabled: true,
      operatorId: operator._id,
      ...(products ? { products } : {}),
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

    const products = sanitizeProducts(req.body?.products);
    if (products) {
      if (products.length === 0) {
        return res.status(400).json({
          error: "products must include at least one of: casino, sportsbook",
        });
      }
      brand.products = products;
    }
    await brand.save();
    return res.json({ brand });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// ── User sub-endpoints ───────────────────────────────────────────────────────

// GET /admin/operators/:id/users
// Returns operator-role accounts both active and soft-deleted, so the FE
// can render removed accounts with a "Deleted" badge and offer a restore
// action. The list/detail callers in the operator-side panel still filter
// `isDeleted: { $ne: true }`; this endpoint is admin-only.
exports.listOperatorUsers = async (req, res) => {
  try {
    const operator = await loadOperatorOr404(req, res);
    if (!operator) return;
    const users = await User.find({
      operatorId: operator._id,
      role: "operator",
    })
      .select("email name username status createdAt isDeleted")
      .sort({ isDeleted: 1, createdAt: 1 })
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

// Loads an operator-role user (any status, including soft-deleted) and
// asserts it belongs to the operator in the URL. 404 otherwise. Both the
// remove and restore endpoints share this so the cross-operator check
// can't drift.
async function loadOperatorUserOr404(req, res, operator) {
  const user = await User.findOne({
    _id: req.params.userId,
    operatorId: operator._id,
    role: "operator",
  });
  if (!user) {
    res.status(404).json({ error: "User not found under this operator" });
    return null;
  }
  return user;
}

// DELETE /admin/operators/:id/users/:userId
// Soft-delete. Won't remove the last remaining active owner so the
// operator never ends up locked out — restore another account first or
// invite a replacement, then delete.
exports.removeOperatorUser = async (req, res) => {
  try {
    const operator = await loadOperatorOr404(req, res);
    if (!operator) return;

    const user = await loadOperatorUserOr404(req, res, operator);
    if (!user) return;

    if (user.isDeleted) {
      return res.status(409).json({ error: "User is already removed" });
    }

    const activeCount = await User.countDocuments({
      operatorId: operator._id,
      role: "operator",
      isDeleted: { $ne: true },
    });
    if (activeCount <= 1) {
      return res.status(400).json({
        error:
          "Can't remove the last active operator account — invite a replacement first.",
      });
    }

    user.isDeleted = true;
    await user.save();

    logger.info("platform_admin.operator_user.removed", {
      operatorId: String(operator._id),
      userId: String(user._id),
      by: String(req.affiliateUser?._id || ""),
    });

    return res.json({
      user: {
        _id: String(user._id),
        email: user.email,
        name: user.name,
        username: user.username,
        status: user.status,
        isDeleted: true,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// POST /admin/operators/:id/users/:userId/restore
// Re-activates a soft-deleted operator account. Doesn't touch their
// password / activation state — same login behaviour they had before.
exports.restoreOperatorUser = async (req, res) => {
  try {
    const operator = await loadOperatorOr404(req, res);
    if (!operator) return;

    const user = await loadOperatorUserOr404(req, res, operator);
    if (!user) return;

    if (!user.isDeleted) {
      return res.status(409).json({ error: "User is already active" });
    }

    user.isDeleted = false;
    await user.save();

    logger.info("platform_admin.operator_user.restored", {
      operatorId: String(operator._id),
      userId: String(user._id),
      by: String(req.affiliateUser?._id || ""),
    });

    return res.json({
      user: {
        _id: String(user._id),
        email: user.email,
        name: user.name,
        username: user.username,
        status: user.status,
        isDeleted: false,
      },
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
          products: Array.isArray(b.products) && b.products.length
            ? b.products
            : ["casino", "sportsbook"],
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

// ── Cross-operator reports ──────────────────────────────────────────────────

// Same metric set as operator-side reportController so the FE can show the
// platform admin a 1:1 mirror of what one operator sees, just summed over
// many tenants. Kept in sync manually for now; if the shape diverges this
// is the second spot to update.
const ADMIN_REPORT_METRIC_COLS = `
  SUM(registrations)                      AS registrations,
  SUM(ftd_count)                          AS ftdCount,
  SUM(ftd_sum_cents)                      AS ftdSumCents,
  SUM(deposits_count)                     AS depositsCount,
  SUM(deposits_sum_cents)                 AS depositsSumCents,
  SUM(cashouts_count)                     AS cashoutsCount,
  SUM(cashouts_sum_cents)                 AS cashoutsSumCents,
  SUM(chargebacks_count)                  AS chargebacksCount,
  SUM(chargebacks_sum_cents)              AS chargebacksSumCents,
  SUM(bets_sum_cents)                     AS betsSumCents,
  SUM(wins_sum_cents)                     AS winsSumCents,
  SUM(casino_bets_rollbacks_sum_cents)    AS casinoBetsRollbacksSumCents,
  SUM(casino_wins_rollbacks_sum_cents)    AS casinoWinsRollbacksSumCents,
  SUM(bonus_issues_sum_cents)             AS bonusIssuesSumCents,
  SUM(additional_deductions_sum_cents)    AS additionalDeductionsSumCents,
  SUM(payment_system_fees_sum_cents)      AS paymentSystemFeesSumCents,
  SUM(jackpot_fees_sum_cents)             AS jackpotFeesSumCents,
  SUM(game_provider_fees_sum_cents)       AS gameProviderFeesSumCents,
  SUM(casino_taxes_sum_cents)             AS casinoTaxesSumCents,
  SUM(rounds_count)                       AS roundsCount,
  SUM(wager_cents)                        AS wagerCents,
  SUM(casino_ggr_cents)                   AS computedGgrCents,
  SUM(casino_ngr_cents)                   AS computedNgrCents,
  SUM(sb_bets_sum_cents)                  AS sbBetsSumCents,
  SUM(sb_cancelled_bets_sum_cents)        AS sbCancelledBetsSumCents,
  SUM(sb_rejected_bets_sum_cents)         AS sbRejectedBetsSumCents,
  SUM(sb_wins_sum_cents)                  AS sbWinsSumCents,
  SUM(sb_win_rollbacks_sum_cents)         AS sbWinRollbacksSumCents,
  SUM(sb_settled_bets_sum_cents)          AS sbSettledBetsSumCents,
  SUM(sb_bonus_issues_sum_cents)          AS sbBonusIssuesSumCents,
  SUM(sb_balance_corrections_sum_cents)   AS sbBalanceCorrectionsSumCents,
  SUM(sb_third_party_fees_sum_cents)      AS sbThirdPartyFeesSumCents,
  SUM(sb_ggr_cents)                       AS sbGgrCents,
  SUM(sb_ngr_cents)                       AS sbNgrCents,
  SUM(combined_ngr_cents)                 AS combinedNgrCents,
  uniqExactIf(player_id, player_id != '__fees__')                    AS playerCount
`.trim();

const ADMIN_REPORT_DEFAULT_SUMMARY = {
  registrations: 0, ftdCount: 0, ftdSumCents: 0,
  depositsCount: 0, depositsSumCents: 0, cashoutsCount: 0, cashoutsSumCents: 0,
  chargebacksCount: 0, chargebacksSumCents: 0, betsSumCents: 0, winsSumCents: 0,
  casinoBetsRollbacksSumCents: 0, casinoWinsRollbacksSumCents: 0,
  bonusIssuesSumCents: 0, additionalDeductionsSumCents: 0,
  paymentSystemFeesSumCents: 0, jackpotFeesSumCents: 0,
  gameProviderFeesSumCents: 0, casinoTaxesSumCents: 0,
  roundsCount: 0, wagerCents: 0, computedGgrCents: 0, computedNgrCents: 0,
  sbBetsSumCents: 0, sbCancelledBetsSumCents: 0, sbRejectedBetsSumCents: 0,
  sbWinsSumCents: 0, sbWinRollbacksSumCents: 0, sbSettledBetsSumCents: 0,
  sbBonusIssuesSumCents: 0, sbBalanceCorrectionsSumCents: 0,
  sbThirdPartyFeesSumCents: 0, sbGgrCents: 0, sbNgrCents: 0, combinedNgrCents: 0,
  playerCount: 0,
};

function coerceCh(row) {
  return Object.fromEntries(
    Object.entries(row).map(([k, v]) => [k, isNaN(Number(v)) ? v : Number(v)]),
  );
}

// Union the product flags across whatever brands fall inside the report
// filter. The FE uses this to hide tiles/columns for products no brand
// in scope actually offers (e.g. an operator with a casino-only brand
// shouldn't see Sportsbook NGR=0 noise).
async function computeProductScope({ operatorId, brandId }) {
  const filter = {};
  if (brandId) filter._id = brandId;
  if (operatorId) filter.operatorId = operatorId;
  const brands = await Brand.find(filter).select({ products: 1 }).lean();
  if (brands.length === 0) {
    // No brand matched — fall back to "both" so the FE doesn't blank out
    // the report header when filters narrow past anything we know about.
    return { casino: true, sportsbook: true };
  }
  const scope = { casino: false, sportsbook: false };
  for (const b of brands) {
    const list = Array.isArray(b.products) && b.products.length
      ? b.products
      : ["casino", "sportsbook"];
    if (list.includes("casino")) scope.casino = true;
    if (list.includes("sportsbook")) scope.sportsbook = true;
  }
  return scope;
}

// GET /admin/reports/overview?from=&to=&operatorId=&brandId=
// Cross-operator metric rollup. Filters are optional:
//   - operatorId  → narrow to one tenant (mirrors what that operator's own
//                   /reports/overview would show)
//   - brandId     → narrow to one brand within (operatorId required for
//                   semantic clarity, but ClickHouse doesn't care)
//   - from/to     → ISO YYYY-MM-DD; default = no time bound
//
// Returns { period, summary, byDay, byOperator } — `byOperator` is the
// platform-admin's extra view: one row per tenant with the same metric
// set so the page can sort operators by NGR/deposits/etc.
exports.adminReportsOverview = async (req, res) => {
  try {
    const conditions = [];
    const params = {};

    if (req.query.operatorId) {
      conditions.push("tenant_id = {tenantId:String}");
      params.tenantId = String(req.query.operatorId);
    }
    if (req.query.brandId) {
      conditions.push("brand_id = {brandId:String}");
      params.brandId = String(req.query.brandId);
    }
    if (req.query.from) {
      conditions.push("from_ts >= {fromTs:DateTime}");
      params.fromTs = `${req.query.from} 00:00:00`;
    }
    if (req.query.to) {
      conditions.push("from_ts <= {toTs:DateTime}");
      params.toTs = `${req.query.to} 23:59:59`;
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const productScope = await computeProductScope({
      operatorId: req.query.operatorId,
      brandId: req.query.brandId,
    });

    const [summaryRows, byDayRows, byOperatorRows] = await Promise.all([
      clickhouse
        .query({
          query: `SELECT ${ADMIN_REPORT_METRIC_COLS} FROM affiliate.activity ${where}`,
          query_params: params,
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
      clickhouse
        .query({
          query: `
            SELECT
              formatDateTime(from_ts, '%Y-%m-%d', 'UTC') AS date,
              ${ADMIN_REPORT_METRIC_COLS}
            FROM affiliate.activity
            ${where}
            GROUP BY date
            ORDER BY date ASC
          `,
          query_params: params,
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
      clickhouse
        .query({
          query: `
            SELECT
              tenant_id AS operatorId,
              ${ADMIN_REPORT_METRIC_COLS}
            FROM affiliate.activity
            ${where}
            GROUP BY tenant_id
            ORDER BY computedNgrCents DESC
          `,
          query_params: params,
          format: "JSONEachRow",
        })
        .then((r) => r.json()),
    ]);

    // Resolve operator names for the byOperator rows so the FE doesn't have
    // to fan out lookups per row.
    const operatorIds = byOperatorRows
      .map((r) => String(r.operatorId || ""))
      .filter(Boolean);
    const operators = operatorIds.length
      ? await Operator.find({ _id: { $in: operatorIds } })
          .select({ _id: 1, id: 1, name: 1 })
          .lean()
      : [];
    const operatorMeta = new Map(
      operators.map((o) => [
        String(o._id),
        { _id: String(o._id), id: o.id, name: o.name },
      ]),
    );

    return res.json({
      period: { from: req.query.from || null, to: req.query.to || null },
      productScope,
      summary: coerceCh(summaryRows[0] ?? ADMIN_REPORT_DEFAULT_SUMMARY),
      byDay: byDayRows.map(coerceCh),
      byOperator: byOperatorRows.map((r) => ({
        ...coerceCh(r),
        operator: operatorMeta.get(String(r.operatorId)) || null,
      })),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// ── Cross-operator affiliates directory ─────────────────────────────────────

// Attach { _id, id, name } meta for every operatorId surfacing in the rows.
// Pulled here as a helper because affiliates/payouts both lean on it.
async function attachOperatorMeta(rows, getOperatorId) {
  const ids = [...new Set(rows.map((r) => String(getOperatorId(r) || "")).filter(Boolean))];
  if (ids.length === 0) return new Map();
  const ops = await Operator.find({ _id: { $in: ids } })
    .select({ _id: 1, id: 1, name: 1 })
    .lean();
  return new Map(
    ops.map((o) => [String(o._id), { _id: String(o._id), id: o.id, name: o.name }]),
  );
}

// GET /admin/affiliates?operatorId=&status=&q=&page=&limit=
// Paginated directory across every operator. Filters all optional:
//   operatorId — narrow to one tenant
//   status     — User.status (active, pending, …)
//   q          — substring match on email / username / name (case-insensitive)
//   page/limit — defaults 1 / 50; limit capped at 200
exports.adminListAffiliates = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit || "50", 10)));

    const filter = { role: "affiliate", isDeleted: { $ne: true } };
    if (req.query.operatorId) filter.operatorId = req.query.operatorId;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.q) {
      const safe = String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const rx = new RegExp(safe, "i");
      filter.$or = [{ email: rx }, { username: rx }, { name: rx }];
    }

    const [total, rows] = await Promise.all([
      User.countDocuments(filter),
      User.find(filter)
        .select("email name username status parentAffiliateId operatorId createdAt")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    const operatorMeta = await attachOperatorMeta(rows, (r) => r.operatorId);

    // Sub-affiliate counts only for the visible page so the query stays
    // bounded — the directory shows "+N subs" badges.
    const visibleIds = rows.map((r) => r._id);
    const subCounts = visibleIds.length
      ? await User.aggregate([
          {
            $match: {
              role: "affiliate",
              isDeleted: { $ne: true },
              parentAffiliateId: { $in: visibleIds },
            },
          },
          { $group: { _id: "$parentAffiliateId", n: { $sum: 1 } } },
        ])
      : [];
    const subCountByParent = new Map(subCounts.map((row) => [String(row._id), row.n]));

    return res.json({
      page,
      limit,
      total,
      affiliates: rows.map((a) => ({
        _id: String(a._id),
        email: a.email,
        name: a.name,
        username: a.username,
        status: a.status,
        parentAffiliateId: a.parentAffiliateId ? String(a.parentAffiliateId) : null,
        subAffiliateCount: subCountByParent.get(String(a._id)) || 0,
        createdAt: a.createdAt,
        operator: operatorMeta.get(String(a.operatorId)) || null,
      })),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// ── Cross-operator payouts directory ────────────────────────────────────────

// GET /admin/payouts?operatorId=&status=&from=&to=&page=&limit=
// Adds an aggregate summary across the filter scope so the FE can show
// totals/counts at the top without a second roundtrip.
exports.adminListPayouts = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit || "50", 10)));

    const filter = {};
    if (req.query.operatorId) filter.operatorId = req.query.operatorId;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.from || req.query.to) {
      filter.createdAt = {};
      if (req.query.from) filter.createdAt.$gte = new Date(`${req.query.from}T00:00:00Z`);
      if (req.query.to)   filter.createdAt.$lte = new Date(`${req.query.to}T23:59:59Z`);
    }

    const [total, rows, summaryRows] = await Promise.all([
      AffiliatePayout.countDocuments(filter),
      AffiliatePayout.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      AffiliatePayout.aggregate([
        { $match: filter },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
            amountCents: { $sum: "$amountCents" },
          },
        },
      ]),
    ]);

    const summary = {
      total,
      byStatus: Object.fromEntries(
        summaryRows.map((r) => [r._id, { count: r.count, amountCents: r.amountCents }]),
      ),
    };

    const operatorMeta = await attachOperatorMeta(rows, (r) => r.operatorId);

    // Resolve affiliate user meta for the visible page.
    const affiliateIds = [...new Set(rows.map((r) => String(r.affiliateId)).filter(Boolean))];
    const affiliates = affiliateIds.length
      ? await User.find({ _id: { $in: affiliateIds } })
          .select({ _id: 1, email: 1, name: 1, username: 1 })
          .lean()
      : [];
    const affiliateById = new Map(
      affiliates.map((u) => [
        String(u._id),
        { _id: String(u._id), email: u.email, name: u.name, username: u.username },
      ]),
    );

    return res.json({
      page,
      limit,
      total,
      summary,
      payouts: rows.map((p) => ({
        _id: String(p._id),
        operator: operatorMeta.get(String(p.operatorId)) || null,
        affiliate: affiliateById.get(String(p.affiliateId)) || null,
        amountCents: p.amountCents,
        currency: p.currency,
        payoutAddress: p.payoutAddress,
        payoutNetwork: p.payoutNetwork,
        status: p.status,
        failureReason: p.failureReason,
        sansTransactionId: p.sansTransactionId,
        initiatedAt: p.initiatedAt,
        dispatchedAt: p.dispatchedAt,
        paidAt: p.paidAt,
        failedAt: p.failedAt,
        createdAt: p.createdAt,
      })),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
