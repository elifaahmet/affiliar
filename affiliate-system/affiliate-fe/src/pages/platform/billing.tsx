import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useBaseQuery } from 'api/core/useBaseQuery';
import { PLATFORM_ADMIN_API_URLS } from 'config/apiUrls';

interface OperatorBillingRow {
  _id: string;
  id: number;
  name: string;
  plan: string;
  billingStatus: 'trial' | 'active' | 'past_due' | 'suspended' | 'cancelled';
  activeDiscountCode: string;
  lifetimeFree?: boolean;
  billingCycle: string | null;
  nextBillingDate: string | null;
  trialEndsAt: string | null;
  pastDueAt: string | null;
  createdAt: string;
  lastPaidAt: string | null;
  lastPaidAmountUsd: number;
  lifetimePaidUsd: number;
  paidCount: number;
  daysSincePaid: number | null;
  daysOverdue: number | null;
  daysUntilDue: number | null;
  daysUntilTrialEnds: number | null;
}

interface BillingResponse {
  summary: {
    total: number;
    lifetimePaidUsd: number;
    byStatus: Record<string, { count: number; lifetimePaidUsd: number }>;
  };
  operators: OperatorBillingRow[];
}

const STATUS_OPTIONS = ['', 'trial', 'active', 'past_due', 'suspended', 'cancelled'] as const;
const STATUS_STYLES: Record<string, string> = {
  trial:     'bg-violet-50 text-violet-700',
  active:    'bg-green-50 text-green-700',
  past_due:  'bg-yellow-50 text-yellow-800',
  suspended: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-600',
};

export default function PlatformBilling() {
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [appliedQ, setAppliedQ] = useState('');

  const { data, isLoading, isError } = useBaseQuery<BillingResponse>({
    endpoint: PLATFORM_ADMIN_API_URLS.LIST_PLATFORM_BILLING({
      status: status || undefined,
      q: appliedQ || undefined,
    }),
    queryKey: ['platform-billing', status, appliedQ],
  });

  const byStatus = data?.summary.byStatus ?? {};

  return (
    <div className='h-full overflow-auto p-6 pb-24 space-y-6'>
      <div>
        <h1 className='text-lg font-semibold text-gray-900'>Platform Admin · Operator Billing</h1>
        <p className='text-xs text-gray-600 mt-0.5'>
          Operatörlerin Hexium'a ödeme durumu — kim ne kadar geç, en son ne zaman ödedi,
          lifetime ne kadar ödemiş.
        </p>
      </div>

      {/* Status tiles */}
      <div className='grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3'>
        <Tile label='Operators total' count={data?.summary.total ?? 0} amountUsd={data?.summary.lifetimePaidUsd ?? 0} highlight />
        <Tile label='Active'    count={byStatus.active?.count    ?? 0} amountUsd={byStatus.active?.lifetimePaidUsd    ?? 0} />
        <Tile label='Trial'     count={byStatus.trial?.count     ?? 0} amountUsd={byStatus.trial?.lifetimePaidUsd     ?? 0} />
        <Tile label='Past due'  count={byStatus.past_due?.count  ?? 0} amountUsd={byStatus.past_due?.lifetimePaidUsd  ?? 0} accent='red' />
        <Tile label='Suspended' count={byStatus.suspended?.count ?? 0} amountUsd={byStatus.suspended?.lifetimePaidUsd ?? 0} accent='red' />
        <Tile label='Cancelled' count={byStatus.cancelled?.count ?? 0} amountUsd={byStatus.cancelled?.lifetimePaidUsd ?? 0} />
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); setAppliedQ(search.trim()); }}
        className='bg-white rounded-xl border border-violet-100 p-4 flex flex-wrap items-end gap-3'
      >
        <Field label='Status'>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCx}>
            {STATUS_OPTIONS.map((s) => (
              <option key={s || 'any'} value={s}>{s ? s.replace('_', ' ') : 'Any'}</option>
            ))}
          </select>
        </Field>
        <Field label='Search operator'>
          <input
            type='search'
            value={search}
            onChange={(e) => { setSearch(e.target.value); if (e.target.value === '') setAppliedQ(''); }}
            placeholder='operator name…'
            className={`${inputCx} w-64`}
          />
        </Field>
        <button type='submit' className='rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50'>
          Search
        </button>
        {(status || appliedQ) && (
          <button
            type='button'
            onClick={() => { setStatus(''); setSearch(''); setAppliedQ(''); }}
            className='text-xs text-gray-500 hover:text-gray-700'
          >
            Clear
          </button>
        )}
      </form>

      <div className='bg-white rounded-xl border border-violet-100 overflow-hidden'>
        {isLoading && <div className='p-8 text-center text-sm text-gray-600'>Loading…</div>}
        {isError && <div className='p-8 text-center text-sm text-red-600'>Failed to load.</div>}
        {!isLoading && !isError && (
          <table className='w-full text-xs'>
            <thead className='bg-gray-50 text-gray-700 font-semibold'>
              <tr>
                <th className='px-3 py-2 text-left'>Operator</th>
                <th className='px-3 py-2 text-left'>Plan</th>
                <th className='px-3 py-2 text-left'>Status</th>
                <th className='px-3 py-2 text-left'>Last paid</th>
                <th className='px-3 py-2 text-right'>Last amount</th>
                <th className='px-3 py-2 text-right'>Lifetime</th>
                <th className='px-3 py-2 text-left'>Lateness</th>
                <th className='px-3 py-2 text-left'>Discount</th>
              </tr>
            </thead>
            <tbody className='divide-y divide-gray-100 text-gray-700'>
              {data?.operators.length === 0 && (
                <tr><td colSpan={8} className='px-3 py-6 text-center text-gray-500'>No operators match the filters.</td></tr>
              )}
              {(data?.operators ?? []).map((op) => (
                <tr key={op._id}>
                  <td className='px-3 py-2 font-medium'>
                    <Link to={`/platform/operators/${op._id}`} className='text-primary hover:underline'>{op.name}</Link>
                  </td>
                  <td className='px-3 py-2 capitalize'>{op.plan}</td>
                  <td className='px-3 py-2'>
                    {op.lifetimeFree ? (
                      <span className='inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-violet-100 text-violet-800'>
                        lifetime free
                      </span>
                    ) : (
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[op.billingStatus] ?? 'bg-gray-100 text-gray-700'}`}>
                        {op.billingStatus.replace('_', ' ')}
                      </span>
                    )}
                  </td>
                  <td className='px-3 py-2 whitespace-nowrap'>
                    {op.lastPaidAt
                      ? (
                        <span>
                          {new Date(op.lastPaidAt).toLocaleDateString('en-GB')}
                          {op.daysSincePaid !== null && (
                            <span className='text-gray-500 ml-1'>· {op.daysSincePaid}d ago</span>
                          )}
                        </span>
                      )
                      : <span className='text-gray-400'>never</span>}
                  </td>
                  <td className='px-3 py-2 text-right'>
                    {op.lastPaidAmountUsd ? `$${op.lastPaidAmountUsd.toLocaleString('en-US')}` : <span className='text-gray-400'>—</span>}
                  </td>
                  <td className='px-3 py-2 text-right font-semibold'>
                    {op.lifetimePaidUsd
                      ? <span>${op.lifetimePaidUsd.toLocaleString('en-US')} <span className='text-gray-500 font-normal text-[10px]'>({op.paidCount} txn{op.paidCount === 1 ? '' : 's'})</span></span>
                      : <span className='text-gray-400'>—</span>}
                  </td>
                  <td className='px-3 py-2'>
                    <Lateness row={op} />
                  </td>
                  <td className='px-3 py-2 font-mono text-[10px]'>{op.activeDiscountCode || <span className='text-gray-400'>—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ── Primitives ─────────────────────────────────────────────────────── */

const inputCx =
  'text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary bg-white';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className='block'>
      <span className='block text-xs font-medium text-gray-700 mb-1'>{label}</span>
      {children}
    </label>
  );
}

function Tile({ label, count, amountUsd, highlight, accent }: {
  label: string;
  count: number;
  amountUsd: number;
  highlight?: boolean;
  accent?: 'red';
}) {
  const border =
    highlight ? 'border-primary/40' :
    accent === 'red' ? 'border-red-200' :
    'border-violet-100';
  const text =
    highlight ? 'text-primary' :
    accent === 'red' ? 'text-red-700' :
    'text-gray-900';
  return (
    <div className={`rounded-xl border bg-white p-4 ${border}`}>
      <div className='text-xs text-gray-500'>{label}</div>
      <div className={`text-lg font-semibold ${text}`}>{count.toLocaleString('en-US')}</div>
      <div className='text-xs text-gray-500 mt-0.5'>${amountUsd.toLocaleString('en-US')} lifetime</div>
    </div>
  );
}

function Lateness({ row }: { row: OperatorBillingRow }) {
  if (row.lifetimeFree) {
    return <span className='text-violet-700'>—</span>;
  }
  const next = row.nextBillingDate ? new Date(row.nextBillingDate).toLocaleDateString('en-GB') : null;
  if (row.billingStatus === 'suspended') {
    return (
      <span className='text-red-700 font-semibold'>
        suspended
        {row.daysOverdue !== null && <span className='font-normal'> · {row.daysOverdue}d overdue</span>}
      </span>
    );
  }
  if (row.billingStatus === 'past_due') {
    return (
      <span className='text-yellow-800 font-semibold'>
        {row.daysOverdue !== null ? `${row.daysOverdue}d overdue` : 'past due'}
        {next && <span className='font-normal text-gray-500'> · due {next}</span>}
      </span>
    );
  }
  if (row.billingStatus === 'trial') {
    if (row.daysUntilTrialEnds === null) return <span className='text-gray-400'>—</span>;
    if (row.daysUntilTrialEnds < 0) return <span className='text-red-700'>trial expired {-row.daysUntilTrialEnds}d ago</span>;
    return <span className='text-violet-700'>trial · {row.daysUntilTrialEnds}d left</span>;
  }
  if (row.billingStatus === 'active') {
    if (row.daysUntilDue === null) return <span className='text-gray-400'>—</span>;
    if (row.daysUntilDue < 0) return <span className='text-yellow-700'>{-row.daysUntilDue}d past nextBillingDate</span>;
    return <span className='text-green-700'>due in {row.daysUntilDue}d</span>;
  }
  return <span className='text-gray-400'>—</span>;
}
