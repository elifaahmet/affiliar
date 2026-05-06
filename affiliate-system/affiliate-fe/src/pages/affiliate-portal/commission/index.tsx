import { useBaseQuery } from 'api/core/useBaseQuery';
import { AFFILIATE_PORTAL_API_URLS } from 'config/apiUrls';

function fmt(cents: number) {
  return (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const STATUS_STYLES: Record<string, string> = {
  draft:            'bg-gray-100 text-gray-600',
  pending_approval: 'bg-warning-light text-warning',
  approved:         'bg-blue-50 text-blue-700',
  paid:             'bg-green-50 text-green-700',
};

const TYPE_STYLES: Record<string, string> = {
  revshare:        'bg-blue-50 text-blue-700',
  cpa:             'bg-purple-50 text-purple-700',
  hybrid:          'bg-indigo-50 text-indigo-700',
  tiered_revshare: 'bg-cyan-50 text-cyan-700',
};

interface CommissionReport {
  _id: string;
  period: { year: number; month: number };
  status: string;
  planId: { name: string; type: string } | null;
  planSnapshot?: { type: string };
  metrics: {
    registrations: number;
    ftdCount: number;
    ngrCents: number;
    ggrCents: number;
    depositsSumCents: number;
  };
  breakdown: {
    revshareAmountCents: number;
    cpaAmountCents: number;
    directCents: number;
    overrideCents: number;
    totalCents: number;
  };
  notes?: string;
}

interface CommissionResponse {
  reports: CommissionReport[];
  total: number;
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function AffiliateCommission() {
  const { data, isLoading, isError } = useBaseQuery<CommissionResponse>({
    endpoint: AFFILIATE_PORTAL_API_URLS.COMMISSION(),
    queryKey: ['affiliate-commission'],
    params: { limit: 24 },
  });

  const reports = data?.reports ?? [];

  const totalEarned   = reports.reduce((s, r) => s + (r.breakdown?.totalCents ?? 0), 0);
  const totalPaid     = reports.filter(r => r.status === 'paid').reduce((s, r) => s + (r.breakdown?.totalCents ?? 0), 0);
  const totalPending  = reports.filter(r => ['draft','pending_approval'].includes(r.status)).reduce((s, r) => s + (r.breakdown?.totalCents ?? 0), 0);

  return (
    <div className='h-full overflow-auto p-6 pb-24 space-y-6'>

      {/* Summary cards */}
      <div className='grid grid-cols-1 sm:grid-cols-3 gap-4'>
        <div className='bg-white rounded-xl p-5 shadow-sm border border-gray-100'>
          <p className='text-xs text-gray-500 mb-1'>Total Earned</p>
          <p className='text-xl font-semibold text-gray-800'>€{fmt(totalEarned)}</p>
        </div>
        <div className='bg-white rounded-xl p-5 shadow-sm border border-gray-100'>
          <p className='text-xs text-gray-500 mb-1'>Total Paid</p>
          <p className='text-xl font-semibold text-green-700'>€{fmt(totalPaid)}</p>
        </div>
        <div className='bg-white rounded-xl p-5 shadow-sm border border-gray-100'>
          <p className='text-xs text-gray-500 mb-1'>Pending / In Review</p>
          <p className='text-xl font-semibold text-warning'>€{fmt(totalPending)}</p>
        </div>
      </div>

      {/* Reports table */}
      <div className='bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden'>
        <div className='px-5 py-3 border-b border-gray-100 flex items-center justify-between'>
          <p className='text-sm font-semibold text-gray-800'>Commission Reports</p>
          <p className='text-xs text-gray-400'>{data?.total ?? 0} total</p>
        </div>

        {isLoading && (
          <div className='p-8 text-center'>
            <p className='text-sm text-gray-400'>Loading...</p>
          </div>
        )}

        {isError && (
          <div className='p-8 text-center'>
            <p className='text-sm text-red-500'>Failed to load commission reports.</p>
          </div>
        )}

        {!isLoading && !isError && reports.length === 0 && (
          <div className='p-8 text-center'>
            <p className='text-sm text-gray-400'>No commission reports yet. Reports are generated monthly by your account manager.</p>
          </div>
        )}

        {!isLoading && !isError && reports.length > 0 && (
          <div className='overflow-x-auto'>
            <table className='w-full'>
              <thead className='bg-gray-50'>
                <tr>
                  <th className='px-4 py-3 text-left text-xs font-semibold text-gray-500'>Period</th>
                  <th className='px-4 py-3 text-left text-xs font-semibold text-gray-500'>Plan</th>
                  <th className='px-4 py-3 text-right text-xs font-semibold text-gray-500'>Regs</th>
                  <th className='px-4 py-3 text-right text-xs font-semibold text-gray-500'>FTDs</th>
                  <th className='px-4 py-3 text-right text-xs font-semibold text-gray-500'>NGR (€)</th>
                  <th className='px-4 py-3 text-right text-xs font-semibold text-gray-500'>Rev Share (€)</th>
                  <th className='px-4 py-3 text-right text-xs font-semibold text-gray-500'>CPA (€)</th>
                  <th className='px-4 py-3 text-right text-xs font-semibold text-gray-500'>Override (€)</th>
                  <th className='px-4 py-3 text-right text-xs font-semibold text-gray-500'>Total (€)</th>
                  <th className='px-4 py-3 text-left text-xs font-semibold text-gray-500'>Status</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-gray-100'>
                {reports.map((r, i) => {
                  const planType = r.planSnapshot?.type ?? r.planId?.type ?? '';
                  return (
                    <tr key={r._id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className='px-4 py-3 text-xs font-medium text-gray-800 whitespace-nowrap'>
                        {MONTHS[(r.period.month ?? 1) - 1]} {r.period.year}
                      </td>
                      <td className='px-4 py-3 whitespace-nowrap'>
                        <div className='flex flex-col gap-0.5'>
                          <span className='text-xs text-gray-700'>{r.planId?.name ?? '—'}</span>
                          {planType && (
                            <span className={`inline-flex w-fit px-1.5 py-0.5 rounded text-[10px] font-medium ${TYPE_STYLES[planType] ?? 'bg-gray-100 text-gray-600'}`}>
                              {planType.replace('_', ' ')}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className='px-4 py-3 text-xs text-gray-700 text-right'>{r.metrics?.registrations ?? 0}</td>
                      <td className='px-4 py-3 text-xs text-gray-700 text-right'>{r.metrics?.ftdCount ?? 0}</td>
                      <td className='px-4 py-3 text-xs text-gray-700 text-right'>{fmt(r.metrics?.ngrCents ?? 0)}</td>
                      <td className='px-4 py-3 text-xs text-gray-700 text-right'>{fmt(r.breakdown?.revshareAmountCents ?? 0)}</td>
                      <td className='px-4 py-3 text-xs text-gray-700 text-right'>{fmt(r.breakdown?.cpaAmountCents ?? 0)}</td>
                      <td className='px-4 py-3 text-xs text-right'>
                        {(r.breakdown?.overrideCents ?? 0) > 0 ? (
                          <span className='text-purple-700 font-medium'>{fmt(r.breakdown.overrideCents)}</span>
                        ) : (
                          <span className='text-gray-400'>—</span>
                        )}
                      </td>
                      <td className='px-4 py-3 text-xs font-semibold text-gray-800 text-right'>{fmt(r.breakdown?.totalCents ?? 0)}</td>
                      <td className='px-4 py-3'>
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[r.status] ?? 'bg-gray-100 text-gray-600'}`}>
                          {r.status.replace('_', ' ')}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
