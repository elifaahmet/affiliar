const Operator = require("../models/Operator");
const User = require("../models/User");
const Brand = require("../models/Brand");
const { getPlan, firstPlanWith, PLAN_ORDER } = require("../utils/planLimits");

// Generic factory for boolean-flag gates (referAFriend, bulkImport,
// apiAccess, whiteLabel, …). Centralises the resolve + planError plumbing
// so each new feature flag only needs one line at the bottom of the file.
function makeFlagGuard({ flag, label }) {
  return async (req, res, next) => {
    try {
      const result = await resolveOperatorPlan(req);
      if (!result) return res.status(400).json({ error: "Operator not found" });
      const { plan, planKey } = result;
      if (!plan[flag]) {
        return res.status(403).json(
          planError(
            `${label} is not available on the ${plan.name} plan.`,
            planKey,
            firstPlanWith((p) => p[flag]),
          ),
        );
      }
      next();
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  };
}

// Featue overrides may arrive as a plain object (from .lean()), a Map, or
// undefined. Normalize to a plain object the caller can safely spread.
function overridesToObject(raw) {
  if (!raw) return {};
  if (raw instanceof Map) return Object.fromEntries(raw);
  if (typeof raw === "object") return { ...raw };
  return {};
}

async function resolveOperatorPlan(req) {
  const user = req.affiliateUser;
  if (!user || !user.operatorId) {
    return null;
  }
  const operator = await Operator.findById(user.operatorId).lean();
  if (!operator || operator.isDeleted) {
    return null;
  }
  // Operator's effective plan = base plan from planLimits.PLANS overlaid
  // with anything in Operator.featureOverrides. So a custom Crew deal can
  // set { crewSystem: true } without bumping the operator off Pro.
  const basePlan = getPlan(operator.plan);
  const overrides = overridesToObject(operator.featureOverrides);
  return {
    operator,
    plan: { ...basePlan, ...overrides },
    basePlan,
    overrides,
    planKey: operator.plan || PLAN_ORDER[0],
  };
}

function planError(message, currentPlan, requiredPlan) {
  return {
    error: message,
    upgrade: true,
    currentPlan,
    requiredPlan,
  };
}

const attachPlan = async (req, res, next) => {
  try {
    const result = await resolveOperatorPlan(req);
    if (!result) {
      return res.status(400).json({ error: "Operator not found" });
    }
    req.operatorPlan = result.plan;
    req.operatorPlanKey = result.planKey;
    next();
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

const checkAffiliateLimit = async (req, res, next) => {
  try {
    const result = await resolveOperatorPlan(req);
    if (!result) {
      return res.status(400).json({ error: "Operator not found" });
    }
    const { plan, planKey } = result;

    const count = await User.countDocuments({
      operatorId: result.operator._id,
      role: "affiliate",
      isDeleted: false,
    });

    if (count >= plan.maxAffiliates) {
      const required = firstPlanWith((p) => p.maxAffiliates > count);
      return res.status(403).json(
        planError(
          `Affiliate limit reached (${plan.maxAffiliates}). Upgrade to add more.`,
          planKey,
          required,
        ),
      );
    }
    next();
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

const checkCommissionType = async (req, res, next) => {
  try {
    const result = await resolveOperatorPlan(req);
    if (!result) {
      return res.status(400).json({ error: "Operator not found" });
    }
    const { plan, planKey } = result;
    const requestedType = req.body.type;

    if (requestedType && !plan.commissionTypes.includes(requestedType)) {
      const required = firstPlanWith((p) =>
        p.commissionTypes.includes(requestedType),
      );
      return res.status(403).json(
        planError(
          `Commission type "${requestedType}" is not available on the ${plan.name} plan.`,
          planKey,
          required,
        ),
      );
    }
    next();
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

const checkSubAffiliates = async (req, res, next) => {
  try {
    const result = await resolveOperatorPlan(req);
    if (!result) {
      return res.status(400).json({ error: "Operator not found" });
    }
    const { plan, planKey } = result;

    if (!plan.subAffiliates) {
      return res.status(403).json(
        planError(
          `Sub-affiliates are not available on the ${plan.name} plan.`,
          planKey,
          firstPlanWith((p) => p.subAffiliates),
        ),
      );
    }
    next();
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

const checkCampaignTracking = async (req, res, next) => {
  try {
    const result = await resolveOperatorPlan(req);
    if (!result) {
      return res.status(400).json({ error: "Operator not found" });
    }
    const { plan, planKey } = result;

    if (!plan.campaignTracking) {
      return res.status(403).json(
        planError(
          `Campaign tracking is not available on the ${plan.name} plan.`,
          planKey,
          firstPlanWith((p) => p.campaignTracking),
        ),
      );
    }
    next();
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// maxBrands gate: count this operator's existing brands (mirrors the
// User.operatorId convention used by checkAffiliateLimit; Brand.operatorId
// points at the operator's User _id, not the tenant id).
const checkMaxBrands = async (req, res, next) => {
  try {
    const result = await resolveOperatorPlan(req);
    if (!result) return res.status(400).json({ error: "Operator not found" });
    const { plan, planKey } = result;
    const user = req.affiliateUser;
    const count = await Brand.countDocuments({
      operatorId: user._id,
      enabled: true,
    });
    if (count >= plan.maxBrands) {
      return res.status(403).json(
        planError(
          `Brand limit reached (${plan.maxBrands}). Upgrade to add more.`,
          planKey,
          firstPlanWith((p) => p.maxBrands > count),
        ),
      );
    }
    next();
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

const checkReferAFriend  = makeFlagGuard({ flag: "referAFriend",  label: "Refer-a-Friend" });
const checkBulkImport    = makeFlagGuard({ flag: "bulkImport",    label: "Bulk CSV import" });
const checkApiAccess     = makeFlagGuard({ flag: "apiAccess",     label: "API access" });
const checkPlayerBonuses = makeFlagGuard({ flag: "playerBonuses", label: "Player Bonuses" });
const checkCreatives     = makeFlagGuard({ flag: "creatives",     label: "Creatives" });
const checkTeam            = makeFlagGuard({ flag: "team",            label: "Team members" });
const checkAdvancedReports = makeFlagGuard({ flag: "advancedReports", label: "Advanced analytics" });
const checkAntiAbuse       = makeFlagGuard({ flag: "antiAbuse",       label: "Anti-abuse signals" });

module.exports = {
  attachPlan,
  checkAffiliateLimit,
  checkCommissionType,
  checkSubAffiliates,
  checkCampaignTracking,
  checkMaxBrands,
  checkReferAFriend,
  checkBulkImport,
  checkApiAccess,
  checkPlayerBonuses,
  checkCreatives,
  checkTeam,
  checkAdvancedReports,
  checkAntiAbuse,
  // For controller-level body-conditional checks:
  resolveOperatorPlan,
  planError,
};
