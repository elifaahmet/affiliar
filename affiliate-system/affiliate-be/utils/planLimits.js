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
    maxPlayers: 2500,          // monthly active players (MAP) — soft cap
    commissionTypes: ["revshare", "cpa", "fixed"],
    subAffiliates: false,      // direct referrals only — no sub-affiliates
    campaignTracking: false,
    referAFriend: false,
    crewSystem: false,
    bulkImport: false,
    customFees: false,
    kycGate: false,
    apiAccess: false,
    whiteLabel: false,
    coManaged: false,
    playerBonuses: false,      // operator bonus offers → affiliate distribution
    creatives: false,          // creative/banner library
    leaderboard: false,        // player leaderboard (operator + affiliate side)
    team: false,               // multi-user operator team (Plus+)
    advancedReports: false,    // cohorts + affiliate-quality (Plus+)
    antiAbuse: false,          // fraud / shared-signal detection (Pro)
  },
  tier2: {
    name: "1-Tier & 2-Tier",
    priceUsd: 98,
    maxAffiliates: 50,
    maxBrands: 3,
    maxPlayers: 10000,
    commissionTypes: ["revshare", "cpa", "hybrid", "tiered_revshare", "fixed"],
    subAffiliates: true,       // 2-tier: sub-affiliates per affiliate
    campaignTracking: true,
    referAFriend: false,
    crewSystem: false,
    bulkImport: false,
    customFees: false,
    kycGate: false,
    apiAccess: false,
    whiteLabel: false,
    coManaged: false,
    playerBonuses: false,      // Plus+ only
    creatives: true,           // tier2+
    leaderboard: false,        // Plus+ only
    team: false,
    advancedReports: false,
    antiAbuse: false,
  },
  plus: {
    name: "Affiliate Plus",
    priceUsd: 494,
    maxAffiliates: 100,
    maxBrands: 10,
    maxPlayers: 75000,
    commissionTypes: ["revshare", "cpa", "hybrid", "tiered_revshare", "fixed"],
    subAffiliates: true,
    campaignTracking: true,
    referAFriend: false,
    crewSystem: false,
    bulkImport: true,          // provider-fee CSV, affiliate CSV import
    customFees: true,          // Custom NGR % + Custom Deposit %
    kycGate: true,             // minKycLevel CPA gate
    apiAccess: false,
    whiteLabel: false,
    coManaged: true,           // DWY co-management (level 1, 25 sourced)
    playerBonuses: true,       // Plus+
    creatives: true,
    leaderboard: true,         // Plus+
    team: true,                // Plus+
    advancedReports: true,     // Plus+
    antiAbuse: false,          // Pro-only
  },
  plusL2: {
    name: "Affiliate Plus L2",
    priceUsd: 935,
    maxAffiliates: 500,
    maxBrands: 50,
    maxPlayers: 400000,
    commissionTypes: ["revshare", "cpa", "hybrid", "tiered_revshare", "fixed"],
    subAffiliates: true,
    campaignTracking: true,
    referAFriend: true,
    crewSystem: true,
    bulkImport: true,
    customFees: true,
    kycGate: true,
    apiAccess: true,           // integration + webhook endpoints
    whiteLabel: false,
    coManaged: true,           // DWY co-management (level 2, 50 sourced)
    playerBonuses: true,
    creatives: true,
    leaderboard: true,
    team: true,
    advancedReports: true,
    antiAbuse: true,
  },
  pro: {
    name: "Affiliate Pro",
    priceUsd: 1430,
    maxAffiliates: 999999,     // unlimited
    maxBrands: 999999,
    maxPlayers: 2000000,   // fair-use; beyond = enterprise
    commissionTypes: ["revshare", "cpa", "hybrid", "tiered_revshare", "fixed"],
    subAffiliates: true,
    campaignTracking: true,
    referAFriend: true,        // Refer-a-Friend is Pro-only
    crewSystem: true,          // Crew (tiered) RaF shape — Pro-only
    bulkImport: true,
    customFees: true,
    kycGate: true,
    apiAccess: true,
    whiteLabel: true,          // custom branding on the affiliate portal
    coManaged: true,           // DWY co-management (level 3, priority)
    playerBonuses: true,
    creatives: true,
    leaderboard: true,
    team: true,
    advancedReports: true,
    antiAbuse: true,           // Pro-only
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
