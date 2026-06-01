import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useBaseQuery } from 'api/core/useBaseQuery';
import { PLATFORM_ADMIN_API_URLS } from 'config/apiUrls';

interface PayoutRow {
  _id: string;
  operator: { _id: string; id: number; name: string } | null;
  affiliate: { _id: string; email: string; name: string; username: string } | null;
  amountCents: number;
  currency: string;
  payoutAddress: string;
  payoutNetwork: string;
  status: 'pending' | 'processing' | 'paid' | 'failed' | 'cancelled';
  failureReason: string | null;
  sansTransactionId: string | null;
  initiatedAt: string | null;
  dispatchedAt: string | null;
  paidAt: string | null;
  failedAt: string | null;
  createdAt: string;
}

interface PayoutsSummary {
  total: number;
  byStatus: Record<string, { count: number; amountCents: number }>;
}

interface PayoutsResponse {
  page: number;
  limit: number;
  total: number;
  summary: PayoutsSummary;
  payouts: PayoutRow[];
}

interface OperatorPickerRow { _id: string; name: string }
interface OperatorsResponse { operators: OperatorPickerRow[] }

const STATUS_OPTIONS = ['', 'pending', 'processing', 'paid', 'failed', 'cancelled'] as const;
const STATUS_STYLES: Record<string, string> = {
  pending:    'bg-amber-50 text-amber-800',
  processing: 'bg-blue-50 text-blue-800',
  paid:       'bg-green-50 text-green-700',
  failed:     'bg-red-100 text-red-800',
  cancelled:  'bg-gray-100 text-gray-600',
};

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export default function PlatformPayouts() {
  const [operatorId, setOperatorId] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState(isoDaysAgo(90));
  const [to, setTo] = useState(isoDaysAgo(0));
  const [page, setPage] = useState(1);
  const limit = 50;

  const operatorsQ = useBaseQuery<OperatorsResponse>({
    endpoint: PLATFORM_ADMIN_API_URLS.LIST_OPERATORS(),
    queryKey: ['platform-operators-picker'],
  });

  const { data, isLoading, isError } = useBaseQuery<PayoutsResponse>({
    endpoint: PLATFORM_ADMIN_API_URLS.LIST_PAYOUTS_ALL({
      operatorId: operatorId || undefined,
      status: status || undefined,
      from, to,
      page,
      limit,
    }),
    queryKey: ['platform-payouts', operatorId, status, from, to, page],
  });

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const byStatus = data?.summary.byStatus ?? {};

  return (
    <div className='h-full overflow-auto p-6 pb-24 space-y-6'>
      <div>
        <h1 className='text-lg font-semibold text-gray-900'>Platform Admin · Payouts</h1>
        <p className='text-xs text-gray-600 mt-0.5'>
          Every affiliate payout across every operator. Status counters reflect the active filters.
        </p>
      </div>

      <div className='bg-white rounded-xl border border-violet-100 p-4 flex flex-wrap items-end gap-3'>
        <Field label='Operator'>
          <select value={operatorId} onChange={(e) => { setOperatorId(e.target.value); setPage(1); }} className={inputCx}>
            <option value=''>All operators</option>
            {(operatorsQ.data?.operators ?? []).map((o) => (
              <option key={o._id} value={o._id}>{o.name}</option>
            ))}
          </select>
        </Field>
        <Field label='Status'>
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className={inputCx}>
            {STATUS_OPTIONS.map((s) => (
              <option key={s || 'any'} value={s}>{s || 'Any'}</option>
            ))}
          </select>
        </Field>
        <Field label='From'>
          <input type='date' value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className={inputCx} />
        </Field>
        <Field label='To'>
          <input type='date' value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className={inputCx} />
        </Field>
        {(operatorId || status) && (
          <button
            type='button'
            onClick={() => { setOperatorId(''); setStatus(''); setPage(1); }}
            className='text-xs text-gray-500 hover:text-gray-700'
          >
            Clear
          </button>
        )}
      </div>

      {/* Status tiles — scoped to the current filter so the user always sees
          totals consistent with the table below. */}
      <div className='grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3'>
        <Tile label='All' count={data?.summary.total ?? 0} amountCents={Object.values(byStatus).reduce((s, x) => s + x.amountCents, 0)} highlight />
        <Tile label='Pending'    count={byStatus.pending?.count    ?? 0} amountCents={byStatus.pending?.amountCents    ?? 0} />
        <Tile label='Processing' count={byStatus.processing?.count ?? 0} amountCents={byStatus.processing?.amountCents ?? 0} />
        <Tile label='Paid'       count={byStatus.paid?.count       ?? 0} amountCents={byStatus.paid?.amountCents       ?? 0} />
        <Tile label='Failed'     count={byStatus.failed?.count     ?? 0} amountCents={byStatus.failed?.amountCents     ?? 0} />
        <Tile label='Cancelled'  count={byStatus.cancelled?.count  ?? 0} amountCents={byStatus.cancelled?.amountCents  ?? 0} />
      </div>

      <div className='bg-white rounded-xl border border-violet-100 overflow-hidden'>
        {isLoading && <div className='p-8 text-center text-sm text-gray-600'>Loading…</div>}
        {isError && <div className='p-8 text-center text-sm text-red-600'>Failed to load.</div>}
        {!isLoading && !isError && (
          <>
            <div className='flex items-center justify-between px-4 py-2 border-b border-gray-100 text-xs text-gray-600'>
              <span>{total.toLocaleString('en-US')} payout{total === 1 ? '' : 's'} total</span>
              {total > limit && (
                <span>Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)}</span>
              )}
            </div>
            <table className='w-full text-xs'>
              <thead className='bg-gray-50 text-gray-700 font-semibold'>
                <tr>
                  <th className='px-3 py-2 text-left'>Created</th>
                  <th className='px-3 py-2 text-left'>Operator</th>
                  <th className='px-3 py-2 text-left'>Affiliate</th>
                  <th className='px-3 py-2 text-right'>Amount</th>
                  <th className='px-3 py-2 text-left'>Wallet</th>
                  <th className='px-3 py-2 text-left'>Status</th>
                  <th className='px-3 py-2 text-left'>Paid / Failed</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-gray-100 text-gray-700'>
                {data?.payouts.length === 0 && (
                  <tr><td colSpan={7} className='px-3 py-6 text-center text-gray-500'>No payouts match the filters.</td></tr>
                )}
                {(data?.payouts ?? []).map((p) => (
                  <tr key={p._id}>
                    <td className='px-3 py-2 whitespace-nowrap'>{new Date(p.createdAt).toLocaleDateString('en-GB')}</td>
                    <td className='px-3 py-2'>
                      {p.operator
                        ? <Link to={`/platform/operators/${p.operator._id}`} className='text-primary hover:underline'>{p.operator.name}</Link>
                        : <span className='text-gray-400'>—</span>}
                    </td>
                    <td className='px-3 py-2'>
                      {p.affiliate
                        ? <span><b>{p.affiliate.name}</b> <span className='text-gray-500'>· {p.affiliate.email}</span></span>
                        : <span className='text-gray-400'>—</span>}
                    </td>
                    <td className='px-3 py-2 text-right font-semibold'>{fmtMoney(p.amountCents, p.currency)}</td>
                    <td className='px-3 py-2 font-mono'>
                      <div className='truncate max-w-[200px]' title={p.payoutAddress}>{p.payoutAddress}</div>
                      <div className='text-gray-500 text-[10px]'>{p.payoutNetwork}</div>
                    </td>
                    <td className='px-3 py-2'>
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[p.status] ?? 'bg-gray-100 text-gray-700'}`}>
                        {p.status}
                      </span>
                      {p.failureReason && (
                        <div className='text-[10px] text-red-700 mt-1 max-w-[200px] truncate' title={p.failureReason}>
                          {p.failureReason}
                        </div>
                      )}
                    </td>
                    <td className='px-3 py-2 whitespace-nowrap'>
                      {p.paidAt && <span className='text-green-700'>paid {new Date(p.paidAt).toLocaleDateString('en-GB')}</span>}
                      {p.failedAt && <span className='text-red-700'>failed {new Date(p.failedAt).toLocaleDateString('en-GB')}</span>}
                      {!p.paidAt && !p.failedAt && <span className='text-gray-400'>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {totalPages > 1 && (
              <div className='flex items-center justify-center gap-2 px-4 py-3 border-t border-gray-100 text-xs'>
                <button
                  type='button'
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className='rounded-lg border border-gray-200 px-3 py-1 disabled:opacity-50 hover:bg-gray-50'
                >
                  Prev
                </button>
                <span className='text-gray-600'>Page {page} / {totalPages}</span>
                <button
                  type='button'
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className='rounded-lg border border-gray-200 px-3 py-1 disabled:opacity-50 hover:bg-gray-50'
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

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

function Tile({ label, count, amountCents, highlight }: { label: string; count: number; amountCents: number; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border bg-white p-4 ${highlight ? 'border-primary/40' : 'border-violet-100'}`}>
      <div className='text-xs text-gray-500'>{label}</div>
      <div className={`text-lg font-semibold ${highlight ? 'text-primary' : 'text-gray-900'}`}>{count.toLocaleString('en-US')}</div>
      <div className='text-xs text-gray-500 mt-0.5'>{fmtMoney(amountCents, 'USDT')}</div>
    </div>
  );
}

function fmtMoney(cents: number, currency: string): string {
  const value = (cents || 0) / 100;
  const isStable = currency === 'USDT' || currency === 'USDC' || currency === 'USD';
  return `${isStable ? '$' : ''}${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}${isStable ? '' : ` ${currency}`}`;
}
