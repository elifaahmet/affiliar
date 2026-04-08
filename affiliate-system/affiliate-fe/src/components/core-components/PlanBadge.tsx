interface PlanBadgeProps {
  plan: string;
}

const BADGE_STYLES: Record<string, string> = {
  starter: 'bg-gray-100 text-gray-600',
  growth:  'bg-blue-100 text-blue-700',
  scale:   'bg-purple-100 text-purple-700',
};

export default function PlanBadge({ plan }: PlanBadgeProps) {
  const p = plan || 'starter';
  const cls = BADGE_STYLES[p.toLowerCase()] ?? 'bg-gray-100 text-gray-600';
  const label = p.charAt(0).toUpperCase() + p.slice(1);

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}
