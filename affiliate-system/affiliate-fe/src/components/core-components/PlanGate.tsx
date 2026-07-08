import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useOperatorPlan, OperatorPlanLimits } from 'hooks/useOperatorPlan';

// Per-flag display copy for the upgrade lock. `plan` is the minimum plan that
// unlocks the feature (mirrors planLimits.js).
const GATE_INFO: Partial<Record<keyof OperatorPlanLimits, { feature: string; plan: string }>> = {
  referAFriend:  { feature: 'Refer-a-Friend', plan: 'Affiliate Pro' },
  whiteLabel:    { feature: 'White-label branding', plan: 'Affiliate Pro' },
  playerBonuses: { feature: 'Player Bonuses',  plan: 'Affiliate Plus' },
  leaderboard:   { feature: 'the Player Leaderboard', plan: 'Affiliate Plus' },
  bulkImport:    { feature: 'Bulk import',     plan: 'Affiliate Plus' },
  customFees:    { feature: 'Custom fees',     plan: 'Affiliate Plus' },
  kycGate:       { feature: 'the KYC gate',    plan: 'Affiliate Plus' },
  apiAccess:     { feature: 'API access',      plan: 'Affiliate Plus L2' },
  creatives:     { feature: 'Creatives',       plan: 'the 2-Tier plan' },
  campaignTracking: { feature: 'Campaign tracking', plan: 'the 2-Tier plan' },
  subAffiliates: { feature: 'Sub-affiliates',  plan: 'the 2-Tier plan' },
  team:          { feature: 'Team members',    plan: 'Affiliate Plus' },
  advancedReports: { feature: 'Advanced analytics (cohorts & LTV)', plan: 'Affiliate Plus' },
  antiAbuse:     { feature: 'Anti-abuse signals', plan: 'Affiliate Pro' },
};

/**
 * Gates its children behind an operator plan flag. When the operator's plan
 * (base + featureOverrides) lacks the flag, it renders an upgrade panel with a
 * link to /billing instead of the feature. Works on both operator and affiliate
 * sides — affiliates resolve to their operator's plan.
 *
 * Fail-open: while the plan is loading, or if it can't be resolved, children
 * render (the BE route guards are the real enforcement for gated actions).
 */
export default function PlanGate({
  flag,
  children,
}: {
  flag: keyof OperatorPlanLimits;
  children: ReactNode;
}) {
  const { limits, isLoading } = useOperatorPlan();

  if (isLoading) {
    return (
      <div className='flex items-center justify-center py-16'>
        <div className='h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-primary' />
      </div>
    );
  }

  // Not resolved (endpoint failed) → don't lock; or flag present → allow.
  if (!limits || limits[flag]) return <>{children}</>;

  const info = GATE_INFO[flag] ?? { feature: 'This feature', plan: 'a higher plan' };
  return (
    <div className='flex items-center justify-center py-16 px-4'>
      <div className='rounded-2xl border border-dashed border-violet-200 bg-violet-50/40 p-8 text-center max-w-md'>
        <div className='mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-violet-100 text-violet-700 text-2xl'>🔒</div>
        <h2 className='text-base font-semibold text-gray-800'>Upgrade to unlock {info.feature}</h2>
        <p className='mt-1.5 text-sm text-gray-600'>
          {info.feature[0].toUpperCase() + info.feature.slice(1)} is available on <b>{info.plan}</b> and
          above. Upgrade your plan to enable it.
        </p>
        <Link
          to='/billing'
          className='mt-4 inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark'
        >
          Upgrade plan →
        </Link>
      </div>
    </div>
  );
}
