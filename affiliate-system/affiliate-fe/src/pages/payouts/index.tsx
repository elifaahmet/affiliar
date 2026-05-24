import { useEffect, useState } from 'react';
import { useBaseQuery } from 'api/core/useBaseQuery';
import { useQueryClient } from '@tanstack/react-query';
import axiosInstance from 'config/axiosInstance';
import { AFFILIATE_PAYOUT_API_URLS } from 'config/apiUrls';

// ── Types ────────────────────────────────────────────────────────────────────

interface PendingRow {
  affiliateId: string;
  affiliate: { email: string | null; username: string | null; name: string | null };
  payableCents: number;
  reportCount: number;
  oldestPeriod: string | null;
  wallet: {
    address: string | null;
    network: string;
    setAt: string | null;
    ready: boolean;
  };
  payable: boolean;
}

interface PendingResponse {
  rows: PendingRow[];
  minPayoutCents: number;
  count: number;
}

interface PayoutRow {
  _id: string;
  affiliateId: { _id: string; email: string; username: string; name: string } | string;
  amountCents: number;
  currency: string;
  payoutAddress: string;
  payoutNetwork: string;
  status: 'pending' | 'processing' | 'paid' | 'failed' | 'cancelled';
  failureReason: string | null;
  sansTransactionId: string | null;
  initiatedAt: string;
  paidAt: string | null;
  failedAt: string | null;
  createdAt: string;
}

interface PayoutsResponse {
  payouts: PayoutRow[];
  count: number;
}

interface SettingsResponse {
  affiliatePayoutSettings: {
    minPayoutCents: number;
    currency: string;
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtCents(cents: number, currency = 'USD') {
  const amount = (cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${currency} ${amount}`;
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

function shortAddr(addr: string | null | undefined) {
  if (!addr) return '—';
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

const STATUS_TONE: Record<string, string> = {
  pending:    'bg-gray-100 text-gray-700',
  processing: 'bg-yellow-100 text-yellow-700',
  paid:       'bg-green-100 text-green-700',
  failed:     'bg-red-100 text-red-700',
  cancelled:  'bg-orange-100 text-orange-700',
};

// ── Page ─────────────────────────────────────────────────────────────────────

type TabKey = 'pending' | 'history' | 'settings';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'pending',  label: 'Pending payouts' },
  { key: 'history',  label: 'History' },
  { key: 'settings', label: 'Settings' },
];

export default function PayoutsPage() {
  const [tab, setTab] = useState<TabKey>('pending');

  return (
    <div className='h-full overflow-auto p-6 pb-24 space-y-6'>
      <header className='space-y-1'>
        <h1 className='text-2xl font-semibold tracking-tight text-gray-900'>
          Affiliate Payouts
        </h1>
        <p className='text-sm text-gray-700 max-w-2xl'>
          Send approved commissions to your affiliates&apos; USDT-TRC20 wallets via
          Sans Getirsin. Affiliates set their wallet on their profile page; you
          settle from here.
        </p>
      </header>

      <div className='flex gap-1 bg-white/80 backdrop-blur-sm rounded-xl p-1 border border-violet-100 w-fit'>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key
                ? 'bg-primary text-white shadow-sm shadow-primary/20'
                : 'text-gray-600 hover:text-violet-900 hover:bg-violet-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'pending'  && <PendingTab  />}
      {tab === 'history'  && <HistoryTab  />}
      {tab === 'settings' && <SettingsTab />}
    </div>
  );
}

// ── Pending tab ──────────────────────────────────────────────────────────────

function PendingTab() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useBaseQuery<PendingResponse>({
    endpoint: AFFILIATE_PAYOUT_API_URLS.PENDING(),
    queryKey: ['affiliate-payouts-pending'],
  });

  const rows = data?.rows ?? [];
  const minPayoutCents = data?.minPayoutCents ?? 0;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['affiliate-payouts-pending'] });
    queryClient.invalidateQueries({ queryKey: ['affiliate-payouts-history'] });
  };

  return (
    <div className='space-y-4'>
      <div className='bg-white/80 backdrop-blur-sm rounded-xl border border-violet-100 overflow-hidden'>
        {isLoading && <p className='p-6 text-sm text-gray-700'>Loading…</p>}

        {!isLoading && rows.length === 0 && (
          <p className='p-6 text-sm text-gray-700'>
            No approved commissions waiting to be paid. Approve a commission report from the Commission page to surface it here.
          </p>
        )}

        {rows.length > 0 && (
          <>
            <div className='px-4 py-2.5 bg-violet-50/40 border-b border-violet-100 text-xs text-gray-700'>
              {rows.filter((r) => r.payable).length} of {rows.length} ready to pay.
              {minPayoutCents > 0 && (
                <> Minimum threshold: <b>{fmtCents(minPayoutCents)}</b>.</>
              )}
            </div>
            <table className='w-full text-sm'>
              <thead>
                <tr className='bg-violet-50/60 text-left text-[11px] uppercase tracking-wider text-gray-700'>
                  <th className='px-4 py-2.5 font-semibold'>Affiliate</th>
                  <th className='px-4 py-2.5 font-semibold'>Wallet</th>
                  <th className='px-4 py-2.5 font-semibold text-right'>Reports</th>
                  <th className='px-4 py-2.5 font-semibold'>Oldest</th>
                  <th className='px-4 py-2.5 font-semibold text-right'>Payable</th>
                  <th className='px-4 py-2.5 font-semibold text-right'>Action</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-violet-50'>
                {rows.map((row) => (
                  <PendingRow
                    key={row.affiliateId}
                    row={row}
                    minPayoutCents={minPayoutCents}
                    onChange={refresh}
                  />
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}

function PendingRow({
  row, minPayoutCents, onChange,
}: {
  row: PendingRow;
  minPayoutCents: number;
  onChange: () => void;
}) {
  const [creating, setCreating] = useState(false);

  const reasonForBlock = !row.wallet.address
    ? 'Affiliate has not set a payout wallet yet.'
    : row.payableCents < minPayoutCents
      ? `Below minimum threshold of ${fmtCents(minPayoutCents)}.`
      : null;

  const handlePay = async () => {
    if (!confirm(`Create a payout of ${fmtCents(row.payableCents)} to ${row.wallet.address}?`)) return;
    setCreating(true);
    try {
      await axiosInstance.post(AFFILIATE_PAYOUT_API_URLS.CREATE(), {
        affiliateId: row.affiliateId,
      });
      onChange();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to create payout.');
    } finally {
      setCreating(false);
    }
  };

  const identity = row.affiliate.name || row.affiliate.username || row.affiliate.email || row.affiliateId.slice(-6);

  return (
    <tr>
      <td className='px-4 py-2.5'>
        <div className='text-sm font-medium text-gray-900'>{identity}</div>
        {row.affiliate.email && (
          <div className='text-[11px] text-gray-600'>{row.affiliate.email}</div>
        )}
      </td>
      <td className='px-4 py-2.5'>
        {row.wallet.address ? (
          <div className='flex flex-col gap-0.5'>
            <span className='text-xs font-mono text-gray-700' title={row.wallet.address}>
              {shortAddr(row.wallet.address)}
            </span>
            <span className='text-[10px] text-gray-500'>{row.wallet.network}</span>
          </div>
        ) : (
          <span className='inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-100'>
            No wallet
          </span>
        )}
      </td>
      <td className='px-4 py-2.5 text-right tabular-nums text-gray-700'>
        {row.reportCount}
      </td>
      <td className='px-4 py-2.5 text-gray-700 text-xs'>{fmtDate(row.oldestPeriod)}</td>
      <td className='px-4 py-2.5 text-right tabular-nums font-semibold text-gray-900'>
        {fmtCents(row.payableCents)}
      </td>
      <td className='px-4 py-2.5 text-right'>
        <button
          disabled={!row.payable || creating}
          onClick={handlePay}
          title={reasonForBlock || undefined}
          className='px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-white hover:bg-primary-dark disabled:opacity-40 disabled:cursor-not-allowed'
        >
          {creating ? '…' : 'Pay'}
        </button>
      </td>
    </tr>
  );
}

// ── History tab ──────────────────────────────────────────────────────────────

function HistoryTab() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>('');

  const { data, isLoading } = useBaseQuery<PayoutsResponse>({
    endpoint: AFFILIATE_PAYOUT_API_URLS.LIST(),
    queryKey: ['affiliate-payouts-history', statusFilter],
    params: { ...(statusFilter ? { status: statusFilter } : {}), limit: 100 },
  });
  const payouts = data?.payouts ?? [];

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['affiliate-payouts-history'] });
    queryClient.invalidateQueries({ queryKey: ['affiliate-payouts-pending'] });
  };

  const filters: Array<{ key: string; label: string }> = [
    { key: '',           label: 'All' },
    { key: 'pending',    label: 'Pending' },
    { key: 'processing', label: 'Processing' },
    { key: 'paid',       label: 'Paid' },
    { key: 'failed',     label: 'Failed' },
    { key: 'cancelled',  label: 'Cancelled' },
  ];

  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap items-center gap-1 bg-white/80 backdrop-blur-sm rounded-xl border border-violet-100 p-3'>
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setStatusFilter(f.key)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              statusFilter === f.key
                ? 'bg-primary text-white'
                : 'text-gray-600 hover:bg-violet-50 hover:text-violet-900'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className='bg-white/80 backdrop-blur-sm rounded-xl border border-violet-100 overflow-hidden'>
        {isLoading && <p className='p-6 text-sm text-gray-700'>Loading…</p>}

        {!isLoading && payouts.length === 0 && (
          <p className='p-6 text-sm text-gray-700'>No payouts on record yet.</p>
        )}

        {payouts.length > 0 && (
          <table className='w-full text-sm'>
            <thead>
              <tr className='bg-violet-50/60 text-left text-[11px] uppercase tracking-wider text-gray-700'>
                <th className='px-4 py-2.5 font-semibold'>Date</th>
                <th className='px-4 py-2.5 font-semibold'>Affiliate</th>
                <th className='px-4 py-2.5 font-semibold'>Wallet</th>
                <th className='px-4 py-2.5 font-semibold text-right'>Amount</th>
                <th className='px-4 py-2.5 font-semibold'>Status</th>
                <th className='px-4 py-2.5 font-semibold text-right'>Actions</th>
              </tr>
            </thead>
            <tbody className='divide-y divide-violet-50'>
              {payouts.map((p) => (
                <HistoryRow key={p._id} payout={p} onChange={refresh} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function HistoryRow({
  payout, onChange,
}: {
  payout: PayoutRow;
  onChange: () => void;
}) {
  const aff = typeof payout.affiliateId === 'object' ? payout.affiliateId : null;
  const identity = aff ? (aff.name || aff.username || aff.email) : String(payout.affiliateId).slice(-6);

  const handleAction = async (fn: () => Promise<unknown>, confirmMsg: string) => {
    if (!confirm(confirmMsg)) return;
    try {
      await fn();
      onChange();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Action failed.');
    }
  };

  return (
    <tr>
      <td className='px-4 py-2.5 text-gray-700 text-xs'>{fmtDate(payout.createdAt)}</td>
      <td className='px-4 py-2.5'>
        <div className='text-sm font-medium text-gray-900'>{identity}</div>
        {aff?.email && <div className='text-[11px] text-gray-600'>{aff.email}</div>}
      </td>
      <td className='px-4 py-2.5'>
        <span className='text-xs font-mono text-gray-700' title={payout.payoutAddress}>
          {shortAddr(payout.payoutAddress)}
        </span>
      </td>
      <td className='px-4 py-2.5 text-right tabular-nums font-semibold text-gray-900'>
        {fmtCents(payout.amountCents, payout.currency)}
      </td>
      <td className='px-4 py-2.5'>
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_TONE[payout.status]}`}>
          {payout.status}
        </span>
        {payout.failureReason && (
          <div className='text-[10px] text-red-600 mt-0.5'>{payout.failureReason}</div>
        )}
      </td>
      <td className='px-4 py-2.5 text-right'>
        <div className='flex items-center justify-end gap-1.5'>
          {payout.status === 'pending' && (
            <>
              <button
                onClick={() => handleAction(
                  () => axiosInstance.post(AFFILIATE_PAYOUT_API_URLS.DISPATCH(payout._id)),
                  `Dispatch ${fmtCents(payout.amountCents)} to ${payout.payoutAddress}?`,
                )}
                className='px-2.5 py-1 text-xs font-medium rounded-md bg-primary text-white hover:bg-primary-dark'
              >
                Dispatch
              </button>
              <button
                onClick={() => handleAction(
                  () => axiosInstance.post(AFFILIATE_PAYOUT_API_URLS.CANCEL(payout._id)),
                  'Cancel this pending payout?',
                )}
                className='px-2.5 py-1 text-xs font-medium rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200'
              >
                Cancel
              </button>
            </>
          )}
          {(payout.status === 'pending' || payout.status === 'processing' || payout.status === 'failed') && (
            <button
              onClick={() => handleAction(
                () => axiosInstance.post(AFFILIATE_PAYOUT_API_URLS.MARK_PAID(payout._id)),
                'Mark this payout as paid (manual reconciliation)?',
              )}
              className='px-2.5 py-1 text-xs font-medium rounded-md bg-green-50 text-green-700 border border-green-100 hover:bg-green-100'
            >
              Mark paid
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

// ── Settings tab ─────────────────────────────────────────────────────────────

function SettingsTab() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useBaseQuery<SettingsResponse>({
    endpoint: AFFILIATE_PAYOUT_API_URLS.SETTINGS(),
    queryKey: ['affiliate-payouts-settings'],
  });

  const [minPayoutCents, setMinPayoutCents] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  useEffect(() => {
    if (data?.affiliatePayoutSettings) {
      setMinPayoutCents(data.affiliatePayoutSettings.minPayoutCents ?? 0);
    }
  }, [data]);

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      await axiosInstance.put(AFFILIATE_PAYOUT_API_URLS.SETTINGS(), {
        minPayoutCents,
      });
      setSaveMsg('Saved.');
      queryClient.invalidateQueries({ queryKey: ['affiliate-payouts-settings'] });
      queryClient.invalidateQueries({ queryKey: ['affiliate-payouts-pending'] });
    } catch (err: any) {
      setSaveMsg(err?.response?.data?.error || 'Save failed.');
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 3000);
    }
  };

  if (isLoading) {
    return <p className='text-sm text-gray-700'>Loading…</p>;
  }

  return (
    <div className='bg-white/80 backdrop-blur-sm rounded-xl border border-violet-100 p-6 max-w-2xl'>
      <h2 className='text-sm font-semibold text-gray-800 mb-4'>Payout policy</h2>

      <div className='space-y-4'>
        <div>
          <label className='block text-xs font-medium text-gray-600 mb-1'>
            Minimum payable amount (cents)
          </label>
          <input
            type='number'
            min={0}
            value={minPayoutCents}
            onChange={(e) => setMinPayoutCents(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
            className='w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-primary'
            placeholder='e.g. 5000 = $50'
          />
          <p className='text-[11px] text-gray-500 mt-1'>
            Affiliates with approved commissions below this threshold won&apos;t show a green Pay button.
            Set to 0 to allow any amount. Currently: <b>{fmtCents(minPayoutCents)}</b>.
          </p>
        </div>

        <div className='flex items-center gap-3 pt-2'>
          <button
            onClick={handleSave}
            disabled={saving}
            className='px-5 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-dark disabled:opacity-60'
          >
            {saving ? 'Saving…' : 'Save settings'}
          </button>
          {saveMsg && (
            <p className={`text-xs ${saveMsg === 'Saved.' ? 'text-green-600' : 'text-red-500'}`}>
              {saveMsg}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
