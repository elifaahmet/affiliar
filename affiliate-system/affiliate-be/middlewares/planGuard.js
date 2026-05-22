const Operator = require("../models/Operator");
const User = require("../models/User");
const { getPlan, firstPlanWith, PLAN_ORDER } = require("../utils/planLimits");

async function resolveOperatorPlan(req) {
  const user = req.affiliateUser;
  if (!user || !user.operatorId) {
    return null;
  }
  const operator = await Operator.findById(user.operatorId).lean();
  if (!operator || operator.isDeleted) {
    return null;
  }
  return {
    operator,
    plan: getPlan(operator.plan),
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

module.exports = {
  attachPlan,
  checkAffiliateLimit,
  checkCommissionType,
  checkSubAffiliates,
  checkCampaignTracking,
};
