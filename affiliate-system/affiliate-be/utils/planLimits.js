// Subscription plans for the affiliate platform itself (what an operator pays
// us). Five tiers — see the public pricing page. PLAN_ORDER is cheapest →
// most expensive and drives "upgrade to the next plan that unlocks X"
// suggestions, so no plan key is hardcoded anywhere else.

const PLAN_ORDER = ["tier1", "tier2", "plus", "plusL2", "pro"];

const PLANS = {
  tier1: {
    name: "1-Tier",
    priceUsd: 47,
    maxAffiliates: 100000,
    commissionTypes: ["revshare", "cpa"],
    subAffiliates: false,      // direct referrals only — no sub-affiliates
    campaignTracking: false,
    coManaged: false,
  },
  tier2: {
    name: "1-Tier & 2-Tier",
    priceUsd: 97,
    maxAffiliates: 999999,
    commissionTypes: ["revshare", "cpa", "hybrid", "tiered_revshare"],
    subAffiliates: true,       // 2-tier: sub-affiliates per affiliate
    campaignTracking: true,
    coManaged: false,
  },
  plus: {
    name: "Affiliate Plus",
    priceUsd: 497,
    maxAffiliates: 999999,
    commissionTypes: ["revshare", "cpa", "hybrid", "tiered_revshare"],
    subAffiliates: true,
    campaignTracking: true,
    coManaged: true,           // DWY co-management (level 1)
  },
  plusL2: {
    name: "Affiliate Plus L2",
    priceUsd: 997,
    maxAffiliates: 999999,
    commissionTypes: ["revshare", "cpa", "hybrid", "tiered_revshare"],
    subAffiliates: true,
    campaignTracking: true,
    coManaged: true,           // DWY co-management (level 2)
  },
  pro: {
    name: "Affiliate Pro",
    priceUsd: 2000,
    maxAffiliates: 999999,
    commissionTypes: ["revshare", "cpa", "hybrid", "tiered_revshare"],
    subAffiliates: true,
    campaignTracking: true,
    coManaged: true,           // DWY co-management (level 3)
  },
};

function getPlan(planKey) {
  return PLANS[planKey] || PLANS[PLAN_ORDER[0]];
}

// Cheapest plan (in PLAN_ORDER) for which predicate(plan) is true. Falls back
// to the top plan. Used by planGuard to suggest the right upgrade target.
function firstPlanWith(predicate) {
  for (const key of PLAN_ORDER) {
    if (predicate(PLANS[key], key)) return key;
  }
  return PLAN_ORDER[PLAN_ORDER.length - 1];
}

const PLAN_PRICES_USD = Object.fromEntries(
  PLAN_ORDER.map((k) => [k, PLANS[k].priceUsd]),
);

module.exports = { PLANS, PLAN_ORDER, getPlan, firstPlanWith, PLAN_PRICES_USD };
