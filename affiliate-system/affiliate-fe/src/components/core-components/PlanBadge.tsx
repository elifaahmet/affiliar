interface PlanBadgeProps {
  plan: string;
}

// Keyed to the five subscription tiers (see affiliate-be/utils/planLimits.js).
const BADGE_STYLES: Record<string, string> = {
  tier1:  'bg-gray-100 text-gray-600',
  tier2:  'bg-emerald-100 text-emerald-700',
  plus:   'bg-violet-100 text-violet-700',
  plusl2: 'bg-fuchsia-100 text-fuchsia-700',
  pro:    'bg-amber-100 text-amber-700',
};

const PLAN_LABELS: Record<string, string> = {
  tier1:  '1-Tier',
  tier2:  '2-Tier',
  plus:   'Affiliate Plus',
  plusl2: 'Affiliate Plus L2',
  pro:    'Affiliate Pro',
};

export default function PlanBadge({ plan }: PlanBadgeProps) {
  const key = (plan || 'tier1').toLowerCase();
  const cls = BADGE_STYLES[key] ?? 'bg-gray-100 text-gray-600';
  const label = PLAN_LABELS[key] ?? plan;

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}
