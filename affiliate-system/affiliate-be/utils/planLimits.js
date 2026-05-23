// Subscription plans for the affiliate platform itself (what an operator pays
// us). Five tiers — see the public pricing page. PLAN_ORDER is cheapest →
// most expensive and drives "upgrade to the next plan that unlocks X"
// suggestions, so no plan key is hardcoded anywhere else.

const PLAN_ORDER = ["tier1", "tier2", "plus", "plusL2", "pro"];

// Feature flags carried per plan. Only `maxAffiliates`, `commissionTypes`,
// `subAffiliates` and `campaignTracking` are currently enforced by
// planGuard.js — the rest live here as the source of truth for the public
// pricing page; wiring them into real middleware is a follow-up step.
const PLANS = {
  tier1: {
    name: "1-Tier",
    priceUsd: 53,
    maxAffiliates: 10,
    maxBrands: 1,
    commissionTypes: ["revshare", "cpa"],
    subAffiliates: false,      // direct referrals only — no sub-affiliates
    campaignTracking: false,
    referAFriend: false,
    bulkImport: false,
    customFees: false,
    kycGate: false,
    apiAccess: false,
    whiteLabel: false,
    coManaged: false,
  },
  tier2: {
    name: "1-Tier & 2-Tier",
    priceUsd: 98,
    maxAffiliates: 50,
    maxBrands: 3,
    commissionTypes: ["revshare", "cpa", "hybrid", "tiered_revshare"],
    subAffiliates: true,       // 2-tier: sub-affiliates per affiliate
    campaignTracking: true,
    referAFriend: false,
    bulkImport: false,
    customFees: false,
    kycGate: false,
    apiAccess: false,
    whiteLabel: false,
    coManaged: false,
  },
  plus: {
    name: "Affiliate Plus",
    priceUsd: 494,
    maxAffiliates: 100,
    maxBrands: 10,
    commissionTypes: ["revshare", "cpa", "hybrid", "tiered_revshare"],
    subAffiliates: true,
    campaignTracking: true,
    referAFriend: false,
    bulkImport: true,          // provider-fee CSV, affiliate CSV import
    customFees: true,          // Custom NGR % + Custom Deposit %
    kycGate: true,             // minKycLevel CPA gate
    apiAccess: false,
    whiteLabel: false,
    coManaged: true,           // DWY co-management (level 1, 25 sourced)
  },
  plusL2: {
    name: "Affiliate Plus L2",
    priceUsd: 998,
    maxAffiliates: 500,
    maxBrands: 50,
    commissionTypes: ["revshare", "cpa", "hybrid", "tiered_revshare"],
    subAffiliates: true,
    campaignTracking: true,
    referAFriend: false,
    bulkImport: true,
    customFees: true,
    kycGate: true,
    apiAccess: true,           // integration + webhook endpoints
    whiteLabel: false,
    coManaged: true,           // DWY co-management (level 2, 50 sourced)
  },
  pro: {
    name: "Affiliate Pro",
    priceUsd: 1799,
    maxAffiliates: 999999,     // unlimited
    maxBrands: 999999,
    commissionTypes: ["revshare", "cpa", "hybrid", "tiered_revshare"],
    subAffiliates: true,
    campaignTracking: true,
    referAFriend: true,        // Refer-a-Friend is Pro-only
    bulkImport: true,
    customFees: true,
    kycGate: true,
    apiAccess: true,
    whiteLabel: true,          // custom branding on the affiliate portal
    coManaged: true,           // DWY co-management (level 3, priority)
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
