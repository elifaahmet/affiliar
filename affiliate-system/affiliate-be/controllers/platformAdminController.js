"use strict";

const Operator                  = require("../models/Operator");
const User                      = require("../models/User");
const Brand                     = require("../models/Brand");
const OperatorFinancialSettings = require("../models/OperatorFinancialSettings");
const DiscountCode              = require("../models/DiscountCode");
const { PLAN_ORDER }            = require("../utils/planLimits");
const { sendOperatorInvite }    = require("../utils/mailer");
const { logger }                = require("../middlewares/logger");

// POST /admin/operators
// Hexium-internal onboarding. Creates the Operator doc, an owner User in
// `pending` status (activates via /auth/activate to set their password), one
// default Brand, and an empty OperatorFinancialSettings row so the fees UI
// renders without zeros on the first visit. Optionally pre-attaches a
// discount code (e.g. negotiated BETAMERICANO200) so first checkout already
// has the deal applied.
exports.createOperator = async (req, res) => {
  try {
    const {
      name,
      ownerEmail,
      ownerName,
      ownerUsername,
      plan = "tier1",
      activeDiscountCode = "",
      brandName,
      brandUrl,
    } = req.body || {};

    if (!name || !ownerEmail || !ownerName || !ownerUsername || !brandName) {
      return res.status(400).json({
        error: "name, ownerEmail, ownerName, ownerUsername, brandName are required",
      });
    }
    if (!PLAN_ORDER.includes(plan)) {
      return res.status(400).json({
        error: `plan must be one of: ${PLAN_ORDER.join(", ")}`,
      });
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

    const operator = await Operator.create({
      id: nextId,
      name: name.trim(),
      plan,
      billingStatus: "trial",
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

    const brand = await Brand.create({
      id: 1,
      name: brandName.trim(),
      url: brandUrl?.trim() || null,
      enabled: true,
      operatorId: ownerUser._id, // Brand.operatorId is the OPERATOR USER's _id
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
      brand: {
        _id: String(brand._id),
        name: brand.name,
        url: brand.url,
      },
      activationUrl: `${process.env.APP_URL || ""}/activate?userId=${ownerUser._id}`,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// GET /admin/operators
// Hexium-internal list. Returns every operator + their owner user(s) so the
// admin UI can show a quick directory.
exports.listOperators = async (req, res) => {
  try {
    const operators = await Operator.find({ isDeleted: { $ne: true } })
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
