interface UpgradeBannerProps {
  message: string;
  currentPlan: string;
  requiredPlan: string;
}

export default function UpgradeBanner({ message, currentPlan, requiredPlan }: UpgradeBannerProps) {
  const subject = encodeURIComponent(
    `Upgrade from ${currentPlan} to ${requiredPlan}`,
  );

  return (
    <div className='bg-amber-50 border-l-4 border-amber-400 p-3 rounded-r-lg text-sm text-amber-800 flex items-start gap-2'>
      <span className='shrink-0 mt-0.5' aria-hidden='true'>&#9888;</span>
      <div className='flex-1'>
        <span>{message}</span>
        {' '}
        <a
          href={`mailto:hello@affiliar.co?subject=${subject}`}
          className='inline-flex items-center gap-1 font-medium text-amber-900 hover:underline'
        >
          Contact Sales &rarr;
        </a>
      </div>
    </div>
  );
}
