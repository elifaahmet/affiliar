import { useState } from 'react';
import { useBaseQuery } from 'api/core/useBaseQuery';
import { useBaseMutation } from 'api/core/useBaseMutation';
import { AFFILIATE_PORTAL_API_URLS } from 'config/apiUrls';

function fmt(cents: number) {
  return (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const STATUS_STYLES: Record<string, string> = {
  draft:            'bg-gray-100 text-gray-600',
  pending_approval: 'bg-warning-light text-warning',
  approved:         'bg-violet-50 text-violet-700',
  paid:             'bg-green-50 text-green-700',
};

const TYPE_STYLES: Record<string, string> = {
  revshare:        'bg-violet-50 text-violet-700',
  cpa:             'bg-fuchsia-50 text-fuchsia-700',
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
          <p className='text-xs text-gray-700 mb-1'>Total Earned</p>
          <p className='text-xl font-semibold text-gray-800'>€{fmt(totalEarned)}</p>
        </div>
        <div className='bg-white rounded-xl p-5 shadow-sm border border-gray-100'>
          <p className='text-xs text-gray-700 mb-1'>Total Paid</p>
          <p className='text-xl font-semibold text-green-700'>€{fmt(totalPaid)}</p>
        </div>
        <div className='bg-white rounded-xl p-5 shadow-sm border border-gray-100'>
          <p className='text-xs text-gray-700 mb-1'>Pending / In Review</p>
          <p className='text-xl font-semibold text-warning'>€{fmt(totalPending)}</p>
        </div>
      </div>

      {/* Sub-affiliate payouts (incoming + outgoing) */}
      <SubAffiliatePayouts />

      {/* Reports table */}
      <div className='bg-white/80 backdrop-blur-sm rounded-xl border border-violet-100 overflow-hidden'>
        <div className='px-5 py-3 border-b border-gray-100 flex items-center justify-between'>
          <p className='text-sm font-semibold text-gray-800'>Commission Reports</p>
          <p className='text-xs text-gray-600'>{data?.total ?? 0} total</p>
        </div>

        {isLoading && (
          <div className='p-8 text-center'>
            <p className='text-sm text-gray-600'>Loading...</p>
          </div>
        )}

        {isError && (
          <div className='p-8 text-center'>
            <p className='text-sm text-red-500'>Failed to load commission reports.</p>
          </div>
        )}

        {!isLoading && !isError && reports.length === 0 && (
          <div className='p-8 text-center'>
            <p className='text-sm text-gray-600'>No commission reports yet. Reports are generated monthly by your account manager.</p>
          </div>
        )}

        {!isLoading && !isError && reports.length > 0 && (
          <div className='overflow-x-auto'>
            <table className='w-full'>
              <thead className='bg-gray-50'>
                <tr>
                  <th className='px-4 py-3 text-left text-xs font-semibold text-gray-700'>Period</th>
                  <th className='px-4 py-3 text-left text-xs font-semibold text-gray-700'>Plan</th>
                  <th className='px-4 py-3 text-right text-xs font-semibold text-gray-700'>Regs</th>
                  <th className='px-4 py-3 text-right text-xs font-semibold text-gray-700'>FTDs</th>
                  <th className='px-4 py-3 text-right text-xs font-semibold text-gray-700'>NGR (€)</th>
                  <th className='px-4 py-3 text-right text-xs font-semibold text-gray-700'>Rev Share (€)</th>
                  <th className='px-4 py-3 text-right text-xs font-semibold text-gray-700'>CPA (€)</th>
                  <th className='px-4 py-3 text-right text-xs font-semibold text-gray-700'>Override (€)</th>
                  <th className='px-4 py-3 text-right text-xs font-semibold text-gray-700'>Total (€)</th>
                  <th className='px-4 py-3 text-left text-xs font-semibold text-gray-700'>Status</th>
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
                          <span className='text-gray-600'>—</span>
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

// ── Sub-affiliate payouts section ──────────────────────────────────────────────

type Direction = 'incoming' | 'outgoing';

interface SubPayout {
  _id: string;
  direction: Direction;
  period: { year: number; month: number };
  product: 'casino' | 'sportsbook' | 'combined';
  parent: { _id: string; username: string; email: string; name: string } | null;
  sub:    { _id: string; username: string; email: string; name: string } | null;
  subtreeMetrics: {
    ngrCents: number;
    ggrCents: number;
    ftdCount: number;
    qualifiedFtdCount: number;
  };
  subPlanSnapshot: { type: string; revshareRate: number; cpaPerFtdCents: number };
  revshareAmountCents: number;
  cpaAmountCents: number;
  payableCents: number;
  status: 'draft' | 'paid';
  calculatedAt: string | null;
  paidAt: string | null;
}

interface SubPayoutsResponse {
  payouts: SubPayout[];
  total: number;
}

function SubAffiliatePayouts() {
  const [tab, setTab] = useState<Direction>('incoming');

  const { data, isLoading, refetch } = useBaseQuery<SubPayoutsResponse>({
    endpoint: AFFILIATE_PORTAL_API_URLS.SUB_PAYOUTS(),
    queryKey: ['affiliate-sub-payouts', tab],
    params: { direction: tab, limit: 50 },
  });

  const rows = data?.payouts ?? [];

  return (
    <div className='bg-white/80 backdrop-blur-sm rounded-xl border border-violet-100 overflow-hidden'>
      <div className='px-5 py-3 border-b border-gray-100 flex items-center justify-between'>
        <p className='text-sm font-semibold text-gray-800'>Sub-Affiliate Payouts</p>
        <div className='flex gap-1 bg-gray-100 p-0.5 rounded-md'>
          {(['incoming', 'outgoing'] as Direction[]).map((d) => (
            <button
              key={d}
              onClick={() => setTab(d)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                tab === d ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              {d === 'incoming' ? 'From parent' : 'To my subs'}
            </button>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className='p-8 text-center'>
          <p className='text-sm text-gray-600'>Loading…</p>
        </div>
      )}

      {!isLoading && rows.length === 0 && (
        <div className='p-8 text-center'>
          <p className='text-sm text-gray-600'>
            {tab === 'incoming'
              ? 'No incoming payouts yet. If you signed up under another affiliate, the next commission calc will populate this.'
              : 'No outgoing payouts. Invite affiliates under your account and set their plan on the Sub-Affiliates page.'}
          </p>
        </div>
      )}

      {!isLoading && rows.length > 0 && (
        <div className='overflow-x-auto'>
          <table className='w-full'>
            <thead className='bg-gray-50'>
              <tr>
                <th className='px-4 py-3 text-left text-xs font-semibold text-gray-700'>Period</th>
                <th className='px-4 py-3 text-left text-xs font-semibold text-gray-700'>
                  {tab === 'incoming' ? 'From' : 'To'}
                </th>
                <th className='px-4 py-3 text-left text-xs font-semibold text-gray-700'>Product</th>
                <th className='px-4 py-3 text-left text-xs font-semibold text-gray-700'>Plan</th>
                <th className='px-4 py-3 text-right text-xs font-semibold text-gray-700'>NGR (€)</th>
                <th className='px-4 py-3 text-right text-xs font-semibold text-gray-700'>FTDs</th>
                <th className='px-4 py-3 text-right text-xs font-semibold text-gray-700'>Revshare (€)</th>
                <th className='px-4 py-3 text-right text-xs font-semibold text-gray-700'>CPA (€)</th>
                <th className='px-4 py-3 text-right text-xs font-semibold text-gray-700'>Payable (€)</th>
                <th className='px-4 py-3 text-left text-xs font-semibold text-gray-700'>Status</th>
                {tab === 'outgoing' && (
                  <th className='px-4 py-3 text-right text-xs font-semibold text-gray-700'></th>
                )}
              </tr>
            </thead>
            <tbody className='divide-y divide-gray-100'>
              {rows.map((p, i) => {
                const counterparty = tab === 'incoming' ? p.parent : p.sub;
                return (
                  <tr key={p._id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className='px-4 py-3 text-xs font-medium text-gray-800 whitespace-nowrap'>
                      {monthAbbr(p.period.month)} {p.period.year}
                    </td>
                    <td className='px-4 py-3 text-xs text-gray-800'>
                      <p className='font-medium'>{counterparty?.name || counterparty?.username || '—'}</p>
                      <p className='text-[11px] text-gray-600'>{counterparty?.email}</p>
                    </td>
                    <td className='px-4 py-3 text-xs text-gray-700 capitalize'>{p.product}</td>
                    <td className='px-4 py-3 text-xs text-gray-700 whitespace-nowrap'>
                      {planLabel(p.subPlanSnapshot)}
                    </td>
                    <td className='px-4 py-3 text-xs text-gray-700 text-right'>{fmt(p.subtreeMetrics?.ngrCents ?? 0)}</td>
                    <td className='px-4 py-3 text-xs text-gray-700 text-right'>{p.subtreeMetrics?.qualifiedFtdCount ?? 0}</td>
                    <td className='px-4 py-3 text-xs text-gray-700 text-right'>{fmt(p.revshareAmountCents ?? 0)}</td>
                    <td className='px-4 py-3 text-xs text-gray-700 text-right'>{fmt(p.cpaAmountCents ?? 0)}</td>
                    <td className='px-4 py-3 text-xs font-semibold text-gray-800 text-right'>{fmt(p.payableCents ?? 0)}</td>
                    <td className='px-4 py-3'>
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        p.status === 'paid' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {p.status}
                      </span>
                    </td>
                    {tab === 'outgoing' && (
                      <td className='px-4 py-3 text-right'>
                        {p.status === 'draft' ? (
                          <MarkPaidButton payoutId={p._id} onPaid={refetch} />
                        ) : null}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function MarkPaidButton({ payoutId, onPaid }: { payoutId: string; onPaid: () => void }) {
  const mutation = useBaseMutation({
    endpoint: AFFILIATE_PORTAL_API_URLS.MARK_SUB_PAYOUT_PAID(payoutId),
    method: 'post',
    onSuccess: () => onPaid(),
  });
  return (
    <button
      type='button'
      onClick={() => mutation.mutate({})}
      disabled={mutation.isPending}
      className='text-xs font-medium text-primary hover:text-primary-dark disabled:opacity-50'
    >
      {mutation.isPending ? 'Marking…' : 'Mark paid'}
    </button>
  );
}

function planLabel(plan: { type: string; revshareRate: number; cpaPerFtdCents: number }) {
  if (plan.type === 'revshare') return `${plan.revshareRate}% revshare`;
  if (plan.type === 'cpa')      return `€${fmt(plan.cpaPerFtdCents)} / FTD`;
  return `${plan.revshareRate}% + €${fmt(plan.cpaPerFtdCents)} / FTD`;
}

function monthAbbr(m: number) {
  return MONTHS[(m ?? 1) - 1];
}
