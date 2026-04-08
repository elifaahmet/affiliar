import { useState } from 'react';
import { useBaseQuery } from 'api/core/useBaseQuery';
import { AFFILIATE_PORTAL_API_URLS } from 'config/apiUrls';

interface OverviewResponse {
  referralCodes: string[];
}

function fmt(cents: number) {
  return (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface SubAffiliate {
  _id: string;
  username: string;
  email: string;
  name: string;
  status: string;
  createdAt: string;
  overrideRate: number;
  referralCodes: string[];
  commission: {
    totalCents: number;
    paidCents: number;
    reportCount: number;
  };
}

interface SubAffiliatesResponse {
  subAffiliates: SubAffiliate[];
  total: number;
}

export default function AffiliateSubAffiliates() {
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  const { data, isLoading, isError } = useBaseQuery<SubAffiliatesResponse>({
    endpoint: AFFILIATE_PORTAL_API_URLS.SUB_AFFILIATES(),
    queryKey: ['affiliate-sub-affiliates'],
  });

  const { data: overview } = useBaseQuery<OverviewResponse>({
    endpoint: AFFILIATE_PORTAL_API_URLS.OVERVIEW(),
    queryKey: ['affiliate-overview-subs'],
    params: {},
  });

  const subs = data?.subAffiliates ?? [];
  const referralCodes = overview?.referralCodes ?? [];

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  const copyLink = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedLink(text);
      setTimeout(() => setCopiedLink(null), 2000);
    });
  };

  return (
    <div className='bg-gray-100 h-full overflow-auto p-6 pb-24 space-y-6'>

      {/* Summary cards */}
      <div className='grid grid-cols-1 sm:grid-cols-3 gap-4'>
        <div className='bg-white rounded-xl p-5 shadow-sm border border-gray-100'>
          <p className='text-xs text-gray-500 mb-1'>Total Sub-Affiliates</p>
          <p className='text-2xl font-semibold text-gray-800'>{data?.total ?? 0}</p>
        </div>
        <div className='bg-white rounded-xl p-5 shadow-sm border border-gray-100'>
          <p className='text-xs text-gray-500 mb-1'>Active Sub-Affiliates</p>
          <p className='text-2xl font-semibold text-green-700'>
            {subs.filter(s => s.status === 'active').length}
          </p>
        </div>
        <div className='bg-white rounded-xl p-5 shadow-sm border border-gray-100'>
          <p className='text-xs text-gray-500 mb-1'>Override Earned (Total)</p>
          <p className='text-2xl font-semibold text-gray-800'>
            €{fmt(subs.reduce((s, a) => s + (a.commission?.totalCents ?? 0), 0))}
          </p>
          <p className='text-xs text-gray-400 mt-0.5'>from sub-affiliate activity</p>
        </div>
      </div>

      {/* Sub-affiliate table */}
      <div className='bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden'>
        <div className='px-5 py-3 border-b border-gray-100 flex items-center justify-between'>
          <p className='text-sm font-semibold text-gray-800'>Sub-Affiliates</p>
          <p className='text-xs text-gray-400'>{data?.total ?? 0} total</p>
        </div>

        {isLoading && (
          <div className='p-8 text-center'>
            <p className='text-sm text-gray-400'>Loading...</p>
          </div>
        )}

        {isError && (
          <div className='p-8 text-center'>
            <p className='text-sm text-red-500'>Failed to load sub-affiliates.</p>
          </div>
        )}

        {!isLoading && !isError && subs.length === 0 && (
          <div className='p-8 text-center'>
            <p className='text-sm text-gray-400'>No sub-affiliates yet.</p>
            <p className='text-xs text-gray-400 mt-1'>Share your recruit link from the Marketing Tools page to invite sub-affiliates.</p>
          </div>
        )}

        {!isLoading && !isError && subs.length > 0 && (
          <div className='overflow-x-auto'>
            <table className='w-full'>
              <thead className='bg-gray-50'>
                <tr>
                  {['Name', 'Username', 'Email', 'Status', 'Override Rate', 'Commission Earned', 'Joined'].map((h) => (
                    <th key={h} className='px-4 py-3 text-left text-xs font-semibold text-gray-500 whitespace-nowrap'>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className='divide-y divide-gray-100'>
                {subs.map((s, i) => (
                  <tr key={s._id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className='px-4 py-3 text-xs text-gray-800 font-medium'>{s.name || '—'}</td>
                    <td className='px-4 py-3 text-xs text-gray-600'>{s.username || '—'}</td>
                    <td className='px-4 py-3 text-xs text-gray-600'>{s.email}</td>
                    <td className='px-4 py-3'>
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        s.status === 'active'  ? 'bg-green-100 text-green-700' :
                        s.status === 'pending' ? 'bg-warning-light text-warning' :
                                                 'bg-gray-100 text-gray-500'
                      }`}>
                        {s.status}
                      </span>
                    </td>
                    <td className='px-4 py-3 text-xs text-gray-600'>
                      {s.overrideRate > 0 ? `${s.overrideRate}%` : '—'}
                    </td>
                    <td className='px-4 py-3 text-xs font-semibold text-gray-800'>
                      €{fmt(s.commission?.totalCents ?? 0)}
                    </td>
                    <td className='px-4 py-3 text-xs text-gray-500'>
                      {s.createdAt ? new Date(s.createdAt).toLocaleDateString('en-GB') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recruit link */}
      <div className='bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-3'>
        <h2 className='text-sm font-semibold text-gray-800'>Recruit Sub-Affiliates</h2>
        <p className='text-xs text-gray-500'>
          Share the link below to invite other affiliates under your account.
          You will earn an override commission on their NGR as configured by your operator.
        </p>

        {referralCodes.length === 0 ? (
          <div className='rounded-lg border border-dashed border-gray-200 p-4 text-center'>
            <p className='text-xs text-gray-400'>Contact your account manager to get your recruit link enabled.</p>
          </div>
        ) : (
          <div className='space-y-2'>
            {referralCodes.map((code) => {
              const link = `${baseUrl}/register?parentCode=${code}`;
              const isCopied = copiedLink === link;
              return (
                <div key={code} className='flex items-center gap-3 p-4 rounded-lg border border-gray-100 bg-gray-50'>
                  <div className='flex-1 min-w-0'>
                    <p className='text-xs font-semibold text-gray-600 mb-0.5'>
                      Code: <span className='font-mono text-primary'>{code}</span>
                    </p>
                    <p className='text-xs text-gray-400 truncate font-mono'>{link}</p>
                  </div>
                  <button
                    onClick={() => copyLink(link)}
                    className={`shrink-0 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      isCopied
                        ? 'bg-green-100 text-green-700'
                        : 'bg-primary text-white hover:bg-blue-600'
                    }`}
                  >
                    {isCopied ? 'Copied!' : 'Copy Recruit Link'}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <p className='text-xs text-gray-400'>
          Note: Sub-affiliates are limited to 2 levels. Your sub-affiliates cannot recruit further sub-affiliates.
        </p>
      </div>

    </div>
  );
}
