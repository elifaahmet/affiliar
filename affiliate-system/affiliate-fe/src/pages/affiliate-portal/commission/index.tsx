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

type SubPayoutStatus = 'draft' | 'pending' | 'processing' | 'paid' | 'failed' | 'cancelled';

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
  subPlanSnapshot: { type: string; revshareRate: number; cpaSharePercent: number };
  revshareAmountCents: number;
  cpaAmountCents: number;
  payableCents: number;
  status: SubPayoutStatus;
  calculatedAt: string | null;
  paidAt: string | null;
}

interface PayoutBalanceResponse {
  earnedCents: number;
  paidToMeCents: number;
  paidToMySubsCents: number;
  balanceCents: number;
}

const SUB_STATUS_TONE: Record<SubPayoutStatus, string> = {
  draft:      'bg-gray-100 text-gray-600',
  pending:    'bg-yellow-50 text-yellow-700',
  processing: 'bg-yellow-100 text-yellow-700',
  paid:       'bg-green-50 text-green-700',
  failed:     'bg-red-50 text-red-700',
  cancelled:  'bg-orange-50 text-orange-700',
};

interface SubPayoutsResponse {
  payouts: SubPayout[];
  total: number;
}

function SubAffiliatePayouts() {
  const [tab, setTab] = useState<Direction>('incoming');
  const [calcMessage, setCalcMessage] = useState<string | null>(null);

  const { data, isLoading, refetch } = useBaseQuery<SubPayoutsResponse>({
    endpoint: AFFILIATE_PORTAL_API_URLS.SUB_PAYOUTS(),
    queryKey: ['affiliate-sub-payouts', tab],
    params: { direction: tab, limit: 50 },
  });

  // Affiliate's internal commission balance — earned − paidToMe − paidToSubs.
  // Drives the Pay button gating: if balance < amount, payout is blocked at
  // the server, so we surface the number here to avoid surprise.
  const { data: balanceData, refetch: refetchBalance } = useBaseQuery<PayoutBalanceResponse>({
    endpoint: AFFILIATE_PORTAL_API_URLS.PAYOUT_BALANCE(),
    queryKey: ['affiliate-payout-balance'],
  });
  const balance = balanceData?.balanceCents ?? 0;

  const refreshAll = () => {
    refetch();
    refetchBalance();
  };

  const calcMutation = useBaseMutation<
    { payoutsCreated: number; payoutsUpdated: number; skipped: number },
    Record<string, never>
  >({
    endpoint: AFFILIATE_PORTAL_API_URLS.CALC_SUB_PAYOUTS(),
    method: 'post',
    onSuccess: (res) => {
      setCalcMessage(
        `Recalculated — ${res.payoutsCreated} new, ${res.payoutsUpdated} updated, ${res.skipped} skipped.`,
      );
      refetch();
      setTimeout(() => setCalcMessage(null), 5000);
    },
    onError: (err: any) => {
      setCalcMessage(err?.response?.data?.error ?? 'Recalculation failed');
      setTimeout(() => setCalcMessage(null), 5000);
    },
  });

  const rows = data?.payouts ?? [];

  return (
    <div className='space-y-4'>
      {/* Balance summary card — only meaningful for outgoing tab but kept
          visible always so the affiliate sees how their incoming commission
          translates to spendable budget. */}
      {balanceData && (
        <div className='bg-white/80 backdrop-blur-sm rounded-xl border border-violet-100 p-4'>
          <div className='grid grid-cols-2 sm:grid-cols-4 gap-3'>
            <BalanceTile label='Earned'         value={fmt(balanceData.earnedCents)} hint='Approved commissions' />
            <BalanceTile label='Paid to me'     value={fmt(balanceData.paidToMeCents)} hint='Op → my wallet (paid + reserved)' />
            <BalanceTile label='Paid to subs'   value={fmt(balanceData.paidToMySubsCents)} hint='Out to my children' />
            <BalanceTile label='Available'      value={fmt(balance)} hint='Left to spend on sub-payouts' tone={balance > 0 ? 'good' : 'muted'} />
          </div>
        </div>
      )}

      <div className='bg-white/80 backdrop-blur-sm rounded-xl border border-violet-100 overflow-hidden'>
      <div className='px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap'>
        <p className='text-sm font-semibold text-gray-800'>Sub-Affiliate Payouts</p>
        <div className='flex items-center gap-3'>
          {calcMessage && <p className='text-xs text-gray-700'>{calcMessage}</p>}
          <button
            type='button'
            disabled={calcMutation.isPending}
            onClick={() => calcMutation.mutate({})}
            className='px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-white hover:bg-primary-dark disabled:opacity-50'
          >
            {calcMutation.isPending ? 'Recalculating…' : 'Recalculate this month'}
          </button>
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
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${SUB_STATUS_TONE[p.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {p.status}
                      </span>
                    </td>
                    {tab === 'outgoing' && (
                      <td className='px-4 py-3 text-right'>
                        <SubPayoutActions
                          payout={p}
                          balanceCents={balance}
                          onChange={refreshAll}
                        />
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
    </div>
  );
}

function BalanceTile({
  label, value, hint, tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'good' | 'muted';
}) {
  const valueCls =
    tone === 'good'  ? 'text-violet-700' :
    tone === 'muted' ? 'text-gray-400'   :
                       'text-gray-800';
  return (
    <div>
      <p className='text-[10px] font-semibold uppercase tracking-wider text-gray-600'>{label}</p>
      <p className={`text-base font-semibold mt-0.5 ${valueCls}`}>{value}</p>
      {hint && <p className='text-[10px] text-gray-500 mt-0.5'>{hint}</p>}
    </div>
  );
}

// Translate the API's machine-readable error codes into a sentence the
// affiliate can act on. Anything not in the table falls through to the
// raw string (preserves Sans/network messages we haven't seen yet).
function friendlySubPayoutError(err: any): string {
  const data = err?.response?.data;
  const code: string = data?.error || err?.message || 'Something went wrong.';

  switch (code) {
    case 'sub_has_no_wallet':
      return 'This sub-affiliate hasn’t added a USDT-TRC20 wallet yet. Ask them to set one on their Profile page before retrying.';
    case 'insufficient_balance': {
      const bal = (data?.balanceCents ?? 0) / 100;
      const need = (data?.payableCents ?? 0) / 100;
      return `Not enough internal balance. You can spend ${bal.toFixed(2)} USDT but this payout needs ${need.toFixed(2)}. Wait for the next commission cycle or ask your operator to release more first.`;
    }
    case 'zero_amount':
      return 'This payout has no amount to send.';
    case 'not_dispatchable':
      return `This payout can’t be sent right now (status: ${data?.status || 'unknown'}). Refresh and try again.`;
    case 'not_pending':
      return `Only payouts that are still pending can be cancelled (current status: ${data?.status || 'unknown'}).`;
    case 'payout_not_found':
      return 'Payout not found. It may have been removed — refresh the page.';
    case 'operator_user_not_found':
      return 'Couldn’t reach your operator’s payment account. Contact support.';
  }

  // Sans-side failures bubble up with prefixes like "token: …", "list: …",
  // "create: HTTP 502". Surface a readable variant.
  if (typeof code === 'string') {
    if (code.startsWith('token:')) return 'Payment provider session couldn’t be opened. Try again in a moment.';
    if (code.startsWith('list:'))  return 'The payment provider returned no withdraw account for this amount. Try a different amount or contact support.';
    if (code.startsWith('create:')) return 'The payment provider rejected the transfer. Check the sub-affiliate’s wallet address and try again.';
  }

  return typeof code === 'string' ? code : 'Something went wrong.';
}

// Per-row action group. `draft`/`failed` rows can be Paid (Sans dispatch).
// `pending` rows can be Cancelled. Manual Mark-Paid remains for out-of-band
// reconciliation across draft/failed.
function SubPayoutActions({
  payout, balanceCents, onChange,
}: {
  payout: SubPayout;
  balanceCents: number;
  onChange: () => void;
}) {
  const canDispatch = payout.status === 'draft' || payout.status === 'failed';
  const canCancel   = payout.status === 'pending';
  const canMarkPaid = payout.status === 'draft' || payout.status === 'failed';
  const balanceOk   = balanceCents >= payout.payableCents;

  const dispatchMut = useBaseMutation({
    endpoint: AFFILIATE_PORTAL_API_URLS.DISPATCH_SUB_PAYOUT(payout._id),
    method: 'post',
    onSuccess: onChange,
    onError: (err: any) => alert(friendlySubPayoutError(err)),
  });
  const cancelMut = useBaseMutation({
    endpoint: AFFILIATE_PORTAL_API_URLS.CANCEL_SUB_PAYOUT(payout._id),
    method: 'post',
    onSuccess: onChange,
    onError: (err: any) => alert(friendlySubPayoutError(err)),
  });
  const markMut = useBaseMutation({
    endpoint: AFFILIATE_PORTAL_API_URLS.MARK_SUB_PAYOUT_PAID(payout._id),
    method: 'post',
    onSuccess: onChange,
    onError: (err: any) => alert(friendlySubPayoutError(err)),
  });

  const handlePay = () => {
    const ok = window.confirm(
      `Send ${fmt(payout.payableCents)} USDT-TRC20 to ${payout.sub?.username ?? 'sub-affiliate'} via Sans NOW?\n\n` +
      `This will debit your internal balance and dispatch a real transfer. ` +
      `Your operator pays out the rest of your commission net of this.`,
    );
    if (!ok) return;
    dispatchMut.mutate({} as any);
  };

  return (
    <div className='flex items-center justify-end gap-1.5'>
      {canDispatch && (
        <button
          disabled={dispatchMut.isPending || !balanceOk}
          onClick={handlePay}
          title={!balanceOk ? `Balance too low (${fmt(balanceCents)} available)` : ''}
          className='px-2.5 py-1 text-xs font-medium rounded-md bg-primary text-white hover:bg-primary-dark disabled:opacity-40 disabled:cursor-not-allowed'
        >
          {dispatchMut.isPending ? '…' : 'Pay'}
        </button>
      )}
      {canCancel && (
        <button
          disabled={cancelMut.isPending}
          onClick={() => cancelMut.mutate({} as any)}
          className='px-2.5 py-1 text-xs font-medium rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50'
        >
          {cancelMut.isPending ? '…' : 'Cancel'}
        </button>
      )}
      {canMarkPaid && (
        <button
          disabled={markMut.isPending}
          onClick={() => markMut.mutate({} as any)}
          title='Manual reconciliation (paid off-platform)'
          className='px-2.5 py-1 text-xs font-medium rounded-md bg-green-50 text-green-700 border border-green-100 hover:bg-green-100 disabled:opacity-50'
        >
          {markMut.isPending ? '…' : 'Mark paid'}
        </button>
      )}
    </div>
  );
}

function planLabel(plan: { type: string; revshareRate: number; cpaSharePercent: number }) {
  if (plan.type === 'revshare') return `${plan.revshareRate}% of revshare`;
  if (plan.type === 'cpa')      return `${plan.cpaSharePercent}% of CPA`;
  return `${plan.revshareRate}% revshare + ${plan.cpaSharePercent}% CPA`;
}

function monthAbbr(m: number) {
  return MONTHS[(m ?? 1) - 1];
}
