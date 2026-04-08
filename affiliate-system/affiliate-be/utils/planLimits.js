const PLANS = {
  starter: {
    name: "Starter",
    maxAffiliates: 50,
    commissionTypes: ["revshare", "cpa"],
    subAffiliates: false,
    campaignTracking: false,
  },
  growth: {
    name: "Growth",
    maxAffiliates: 500,
    commissionTypes: ["revshare", "cpa", "hybrid", "tiered_revshare"],
    subAffiliates: true,
    campaignTracking: true,
  },
  scale: {
    name: "Scale",
    maxAffiliates: 999999,
    commissionTypes: ["revshare", "cpa", "hybrid", "tiered_revshare"],
    subAffiliates: true,
    campaignTracking: true,
  },
};

function getPlan(planKey) {
  return PLANS[planKey] || PLANS.starter;
}

const PLAN_PRICES_USD = {
  starter: 999,
  growth: 1999,
  scale: 2999,
};

module.exports = { PLANS, getPlan, PLAN_PRICES_USD };
