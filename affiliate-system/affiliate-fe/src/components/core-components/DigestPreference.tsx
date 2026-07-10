import { useState } from 'react';
import { useBaseQuery } from 'api/core/useBaseQuery';
import { OPERATOR_API_URLS } from 'config/apiUrls';
import axiosInstance from 'config/axiosInstance';

interface DigestPref {
  digestFrequency: 'weekly' | 'monthly' | 'off';
  emailNotifications: boolean;
}

const OPTIONS: { value: DigestPref['digestFrequency']; label: string; hint: string }[] = [
  { value: 'weekly',  label: 'Weekly',  hint: 'Every Monday — last week’s NGR, FTDs & top affiliates.' },
  { value: 'monthly', label: 'Monthly', hint: 'Start of each month — the full month incl. commission.' },
  { value: 'off',     label: 'Off',     hint: 'No report emails.' },
];

/**
 * Self-service report-email cadence selector. Reads + writes the current user's
 * digestFrequency via /operators/digest-preference (works for operators and
 * affiliates). Drop it into any profile/settings page.
 */
export default function DigestPreference() {
  const { data, refetch } = useBaseQuery<DigestPref>({
    endpoint: OPERATOR_API_URLS.DIGEST_PREFERENCE(),
    queryKey: ['digest-preference'],
  });
  const [saving, setSaving] = useState<string | null>(null);

  const current = data?.digestFrequency ?? 'weekly';
  const emailOff = data && data.emailNotifications === false;

  const choose = async (value: DigestPref['digestFrequency']) => {
    if (value === current || saving) return;
    setSaving(value);
    try {
      await axiosInstance.patch(OPERATOR_API_URLS.DIGEST_PREFERENCE(), { digestFrequency: value });
      await refetch();
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className='rounded-xl border border-gray-100 bg-white p-5'>
      <h3 className='text-sm font-semibold text-gray-800'>Report emails</h3>
      <p className='mt-0.5 text-xs text-gray-600'>Get your performance summary by email. Change the cadence anytime.</p>
      <div className='mt-3 flex flex-wrap gap-2'>
        {OPTIONS.map((o) => {
          const active = current === o.value;
          return (
            <button
              key={o.value}
              type='button'
              disabled={!!saving}
              onClick={() => choose(o.value)}
              title={o.hint}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-60 ${
                active ? 'border-primary bg-primary/5 text-primary' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {saving === o.value ? 'Saving…' : o.label}
            </button>
          );
        })}
      </div>
      <p className='mt-2 text-xs text-gray-500'>{OPTIONS.find((o) => o.value === current)?.hint}</p>
      {emailOff && (
        <p className='mt-1 text-xs text-amber-700'>Email notifications are off in your account, so no digests will be sent until you re-enable them.</p>
      )}
    </div>
  );
}
