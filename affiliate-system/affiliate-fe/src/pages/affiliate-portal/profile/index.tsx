import { useEffect, useState } from 'react';
import { useBaseQuery } from 'api/core/useBaseQuery';
import { AFFILIATE_PORTAL_API_URLS } from 'config/apiUrls';
import axiosInstance from 'config/axiosInstance';
import DigestPreference from '@components/core-components/DigestPreference';
import PayoutWallet from '@components/core-components/PayoutWallet';

interface CommissionPlan {
  _id: string;
  name: string;
  type: string;
  revshare?: { metric: string; rate: number };
  cpa?: { amountCents: number; currency: string };
  tiers?: { fromCents: number; toCents: number | null; rate: number }[];
}

interface ProfileResponse {
  user: {
    _id: string;
    email: string;
    username: string;
    name: string;
    mobileNumber: string | null;
    mobileCountryCode: string | null;
    website: string | null;
    status: string;
    payoutAddress: string | null;
    payoutNetwork: string;
    payoutAddressSetAt: string | null;
  };
  referralCodes: BrandReferralCode[];
  commissionPlan: CommissionPlan | null;
}

interface BrandReferralCode {
  code: string;
  brandId: string | null;
  brandName: string | null;
  brandUrl: string | null;
}

const TYPE_STYLES: Record<string, string> = {
  revshare:        'bg-violet-50 text-violet-700',
  cpa:             'bg-fuchsia-50 text-fuchsia-700',
  hybrid:          'bg-indigo-50 text-indigo-700',
  tiered_revshare: 'bg-cyan-50 text-cyan-700',
};

function fmt(cents: number, currency = 'EUR') {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency });
}

export default function AffiliateProfile() {
  const { data, isLoading, refetch } = useBaseQuery<ProfileResponse>({
    endpoint: AFFILIATE_PORTAL_API_URLS.PROFILE(),
    queryKey: ['affiliate-profile'],
    params: {},
  });

  const [name, setName]                       = useState('');
  const [mobileNumber, setMobileNumber]       = useState('');
  const [mobileCountryCode, setMobileCountryCode] = useState('');
  const [website, setWebsite]                 = useState('');
  const [saving, setSaving]                   = useState(false);
  const [saveMsg, setSaveMsg]                 = useState<string | null>(null);

  useEffect(() => {
    if (data?.user) {
      setName(data.user.name ?? '');
      setMobileNumber(data.user.mobileNumber ?? '');
      setMobileCountryCode(data.user.mobileCountryCode ?? '');
      setWebsite(data.user.website ?? '');
    }
  }, [data]);

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      await axiosInstance.patch(AFFILIATE_PORTAL_API_URLS.PROFILE(), {
        name, mobileNumber, mobileCountryCode, website,
      });
      setSaveMsg('Profile updated successfully.');
      refetch();
    } catch {
      setSaveMsg('Failed to update profile.');
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 3000);
    }
  };


  const plan = data?.commissionPlan;

  if (isLoading) {
    return (
      <div className='h-full overflow-auto p-6'>
        <div className='space-y-4 max-w-2xl'>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className='bg-white rounded-xl p-6 border border-gray-100 animate-pulse h-24' />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className='h-full overflow-auto p-6 pb-24 space-y-6'>

      {/* Account info (read-only) */}
      <div className='bg-white/80 backdrop-blur-sm rounded-xl border border-violet-100 p-6 max-w-2xl'>
        <h2 className='text-sm font-semibold text-gray-800 mb-4'>Account Info</h2>
        <div className='space-y-3'>
          <div className='flex items-center justify-between py-2 border-b border-gray-100'>
            <span className='text-xs text-gray-700'>Email</span>
            <span className='text-xs text-gray-800 font-medium'>{data?.user.email ?? '—'}</span>
          </div>
          <div className='flex items-center justify-between py-2 border-b border-gray-100'>
            <span className='text-xs text-gray-700'>Username</span>
            <span className='text-xs text-gray-800 font-medium'>{data?.user.username ?? '—'}</span>
          </div>
          <div className='flex items-center justify-between py-2'>
            <span className='text-xs text-gray-700'>Status</span>
            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
              data?.user.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'
            }`}>
              {data?.user.status ?? '—'}
            </span>
          </div>
        </div>
      </div>

      {/* Report email cadence */}
      <div className='max-w-2xl'>
        <DigestPreference />
      </div>

      {/* Editable profile */}
      <div className='bg-white/80 backdrop-blur-sm rounded-xl border border-violet-100 p-6 max-w-2xl'>
        <h2 className='text-sm font-semibold text-gray-800 mb-4'>Edit Profile</h2>
        <div className='space-y-4'>
          <div>
            <label className='block text-xs font-medium text-gray-600 mb-1'>Full Name</label>
            <input
              type='text' value={name} onChange={(e) => setName(e.target.value)}
              className='w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-primary'
              placeholder='Your name'
            />
          </div>
          <div className='flex gap-3'>
            <div className='w-32'>
              <label className='block text-xs font-medium text-gray-600 mb-1'>Country Code</label>
              <input
                type='text' value={mobileCountryCode} onChange={(e) => setMobileCountryCode(e.target.value)}
                className='w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-primary'
                placeholder='+1'
              />
            </div>
            <div className='flex-1'>
              <label className='block text-xs font-medium text-gray-600 mb-1'>Mobile Number</label>
              <input
                type='text' value={mobileNumber} onChange={(e) => setMobileNumber(e.target.value)}
                className='w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-primary'
                placeholder='555 000 0000'
              />
            </div>
          </div>

          <div>
            <label className='block text-xs font-medium text-gray-600 mb-1'>Website</label>
            <input
              type='text' value={website} onChange={(e) => setWebsite(e.target.value)}
              className='w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-primary'
              placeholder='https://yoursite.com'
            />
          </div>

          <div className='flex items-center gap-3 pt-2'>
            <button
              onClick={handleSave}
              disabled={saving}
              className='px-5 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-dark disabled:opacity-60 transition-colors'
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            {saveMsg && (
              <p className={`text-xs ${saveMsg.includes('success') ? 'text-green-600' : 'text-red-500'}`}>
                {saveMsg}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Payout wallet — network + asset chosen by the affiliate */}
      <PayoutWallet />

      {/* Commission plan (read-only) */}
      <div className='bg-white/80 backdrop-blur-sm rounded-xl border border-violet-100 p-6 max-w-2xl'>
        <h2 className='text-sm font-semibold text-gray-800 mb-4'>My Commission Plan</h2>
        {!plan ? (
          <p className='text-xs text-gray-600'>No commission plan assigned. Contact your account manager.</p>
        ) : (
          <div className='space-y-3'>
            <div className='flex items-center gap-2'>
              <span className='text-sm font-medium text-gray-800'>{plan.name}</span>
              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_STYLES[plan.type] ?? 'bg-gray-100 text-gray-600'}`}>
                {plan.type.replace('_', ' ')}
              </span>
            </div>

            {plan.type === 'revshare' && plan.revshare && (
              <p className='text-xs text-gray-600'>
                <span className='font-medium'>{plan.revshare.rate}%</span> of {plan.revshare.metric.toUpperCase()}
              </p>
            )}

            {plan.type === 'cpa' && plan.cpa && (
              <p className='text-xs text-gray-600'>
                <span className='font-medium'>{fmt(plan.cpa.amountCents, plan.cpa.currency)}</span> per FTD
              </p>
            )}

            {plan.type === 'hybrid' && (
              <div className='text-xs text-gray-600 space-y-1'>
                {plan.revshare && <p><span className='font-medium'>{plan.revshare.rate}%</span> revenue share on {plan.revshare.metric.toUpperCase()}</p>}
                {plan.cpa     && <p><span className='font-medium'>{fmt(plan.cpa.amountCents, plan.cpa.currency)}</span> per FTD</p>}
              </div>
            )}

            {plan.type === 'tiered_revshare' && plan.tiers && plan.tiers.length > 0 && (
              <div className='overflow-x-auto'>
                <table className='w-full text-xs'>
                  <thead>
                    <tr className='bg-gray-50'>
                      <th className='px-3 py-2 text-left font-semibold text-gray-700'>NGR From</th>
                      <th className='px-3 py-2 text-left font-semibold text-gray-700'>NGR To</th>
                      <th className='px-3 py-2 text-left font-semibold text-gray-700'>Rate</th>
                    </tr>
                  </thead>
                  <tbody className='divide-y divide-gray-100'>
                    {plan.tiers.map((tier, i) => (
                      <tr key={i}>
                        <td className='px-3 py-2 text-gray-700'>{fmt(tier.fromCents)}</td>
                        <td className='px-3 py-2 text-gray-700'>{tier.toCents != null ? fmt(tier.toCents) : '∞'}</td>
                        <td className='px-3 py-2 font-medium text-gray-800'>{tier.rate}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Referral codes (read-only) */}
      <div className='bg-white/80 backdrop-blur-sm rounded-xl border border-violet-100 p-6 max-w-2xl'>
        <h2 className='text-sm font-semibold text-gray-800 mb-4'>My Referral Codes</h2>
        {(data?.referralCodes ?? []).length === 0 ? (
          <p className='text-xs text-gray-600'>No referral codes assigned.</p>
        ) : (
          <div className='flex flex-wrap gap-2'>
            {data!.referralCodes.map((rc) => (
              <span
                key={rc.code}
                className='inline-flex items-center gap-2 px-3 py-1 bg-gray-100 text-gray-700 rounded-lg text-xs'
              >
                {rc.brandName && (
                  <span className='inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-primary/10 text-primary uppercase tracking-wide'>
                    {rc.brandName}
                  </span>
                )}
                <span className='font-mono'>{rc.code}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
