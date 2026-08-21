import { useMemo, useState } from 'react';
import PlayerCell from './PlayerCell';
import { useBaseQuery } from 'api/core/useBaseQuery';
import { useBaseMutation } from 'api/core/useBaseMutation';
import { useQueryClient } from '@tanstack/react-query';
import StyledSelect from '@components/core-components/StyledSelect';
import { REFER_API_URLS } from 'config/apiUrls';

import type {
  Brand,
  FraudFlaggedResponse,
  FraudFlaggedRow,
  PlayerReferral,
  ReferralsResponse,
  TopReferrerRow,
  TopReferrersResponse,
} from '../types';

interface Props {
  brands: Brand[];
}

type SortKey = 'active' | 'earnings';

function fmtCents(cents: number | null | undefined) {
  if (cents == null) return '—';
  const amount = (cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return amount;
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

export default function CrewAdminTab({ brands }: Props) {
  const [brandId, setBrandId] = useState<string>('');
  const [sort, setSort] = useState<SortKey>('active');
  const [drilldownPlayerId, setDrilldownPlayerId] = useState<string | null>(null);

  const { data: topData, isLoading: topLoading } = useBaseQuery<TopReferrersResponse>({
    endpoint: REFER_API_URLS.TOP_REFERRERS(),
    queryKey: ['refer-top-referrers', brandId, sort],
    params: { ...(brandId ? { brandId } : {}), sort, limit: 25 },
  });

  const { data: fraudData, isLoading: fraudLoading } = useBaseQuery<FraudFlaggedResponse>({
    endpoint: REFER_API_URLS.FRAUD_FLAGGED(),
    queryKey: ['refer-fraud-flagged'],
    params: { limit: 50 },
  });

  const referrers = topData?.referrers ?? [];
  const fraud = fraudData?.players ?? [];
  const brandName = (id: string) => brands.find((b) => b._id === id)?.name ?? id.slice(-6);

  return (
    <div className='space-y-6'>
      {/* ── Filters ───────────────────────────────────────────────────────── */}
      <div className='flex flex-wrap items-center gap-3 bg-white/80 backdrop-blur-sm rounded-xl border border-violet-100 p-4'>
        <div className='flex items-center gap-2'>
          <label className='text-xs font-medium text-gray-700'>Brand</label>
          <div className='min-w-[200px]'>
            <StyledSelect
              value={brandId}
              onChange={(v) => setBrandId(v)}
              options={[
                { value: '', label: 'All brands' },
                ...brands.map((b) => ({ value: b._id, label: b.name })),
              ]}
            />
          </div>
        </div>
        <div className='flex items-center gap-1'>
          <span className='text-xs font-medium text-gray-700 mr-1'>Sort by</span>
          {(['active', 'earnings'] as SortKey[]).map((key) => (
            <button
              key={key}
              onClick={() => setSort(key)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                sort === key
                  ? 'bg-primary text-white'
                  : 'text-gray-600 hover:bg-violet-50 hover:text-violet-900'
              }`}
            >
              {key === 'active' ? 'Active crew' : 'Earnings'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Top referrers ─────────────────────────────────────────────────── */}
      <section className='space-y-2'>
        <header className='flex items-baseline justify-between'>
          <h2 className='text-base font-semibold text-gray-900'>Top referrers</h2>
          <p className='text-xs text-gray-600'>
            Click a row to inspect their referrals + run manual actions.
          </p>
        </header>

        <div className='bg-white/80 backdrop-blur-sm rounded-xl border border-violet-100 overflow-hidden'>
          {topLoading && <p className='p-6 text-sm text-gray-700'>Loading…</p>}

          {!topLoading && referrers.length === 0 && (
            <p className='p-6 text-sm text-gray-700'>No referrer activity yet.</p>
          )}

          {referrers.length > 0 && (
            <table className='w-full text-sm'>
              <thead>
                <tr className='bg-violet-50/60 text-left text-[11px] uppercase tracking-wider text-gray-700'>
                  <th className='px-4 py-2.5 font-semibold'>Rank</th>
                  <th className='px-4 py-2.5 font-semibold'>Referrer</th>
                  <th className='px-4 py-2.5 font-semibold'>Username</th>
                  <th className='px-4 py-2.5 font-semibold text-right'>Active crew</th>
                  <th className='px-4 py-2.5 font-semibold text-right'>Pending</th>
                  <th className='px-4 py-2.5 font-semibold text-right'>Total</th>
                  <th className='px-4 py-2.5 font-semibold text-right'>Earnings</th>
                  <th className='px-4 py-2.5 font-semibold'>Last activity</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-violet-50'>
                {referrers.map((row, idx) => (
                  <TopRow
                    key={row.referrerPlayerId}
                    idx={idx}
                    row={row}
                    onClick={() => setDrilldownPlayerId(row.referrerPlayerId)}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* ── Fraud flagged ─────────────────────────────────────────────────── */}
      <section className='space-y-2'>
        <header className='flex items-baseline justify-between'>
          <h2 className='text-base font-semibold text-gray-900'>Fraud-flagged players</h2>
          <p className='text-xs text-gray-600'>
            Set by the operator&apos;s casino backend via the <code className='text-[10px] bg-violet-50 px-1 py-0.5 rounded'>player.flagged</code> event.
          </p>
        </header>

        <div className='bg-white/80 backdrop-blur-sm rounded-xl border border-violet-100 overflow-hidden'>
          {fraudLoading && <p className='p-6 text-sm text-gray-700'>Loading…</p>}

          {!fraudLoading && fraud.length === 0 && (
            <p className='p-6 text-sm text-gray-700'>No flagged players on record.</p>
          )}

          {fraud.length > 0 && (
            <table className='w-full text-sm'>
              <thead>
                <tr className='bg-violet-50/60 text-left text-[11px] uppercase tracking-wider text-gray-700'>
                  <th className='px-4 py-2.5 font-semibold'>Player</th>
                  <th className='px-4 py-2.5 font-semibold'>Brand</th>
                  <th className='px-4 py-2.5 font-semibold'>Country</th>
                  <th className='px-4 py-2.5 font-semibold'>Flag reason</th>
                  <th className='px-4 py-2.5 font-semibold'>Flagged at</th>
                  <th className='px-4 py-2.5 font-semibold'>Registered</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-violet-50'>
                {fraud.map((row) => (
                  <FraudRow key={row._id} row={row} brandName={brandName(row.brandId)} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {drilldownPlayerId && (
        <ReferrerDrilldownModal
          referrerPlayerId={drilldownPlayerId}
          brands={brands}
          onClose={() => setDrilldownPlayerId(null)}
        />
      )}
    </div>
  );
}

// ── Top referrers table row ──────────────────────────────────────────────────

function TopRow({
  idx,
  row,
  onClick,
}: {
  idx: number;
  row: TopReferrerRow;
  onClick: () => void;
}) {
  return (
    <tr
      onClick={onClick}
      className='cursor-pointer hover:bg-violet-50/30'
    >
      <td className='px-4 py-2.5 text-gray-700 tabular-nums'>{idx + 1}</td>
      <td className='px-4 py-2.5 font-mono text-[11px] text-gray-700'>{row.referrerPlayerId}</td>
      <td className='px-4 py-2.5'><PlayerCell username={row.referrerPlayerIdUsername} /></td>
      <td className='px-4 py-2.5 text-right tabular-nums font-semibold text-violet-700'>
        {row.activeReferrals}
      </td>
      <td className='px-4 py-2.5 text-right tabular-nums text-gray-700'>{row.pendingReferrals}</td>
      <td className='px-4 py-2.5 text-right tabular-nums text-gray-700'>{row.totalReferrals}</td>
      <td className='px-4 py-2.5 text-right tabular-nums text-gray-900'>{fmtCents(row.earningsCents)}</td>
      <td className='px-4 py-2.5 text-gray-700 text-xs'>{fmtDate(row.lastActivityAt)}</td>
    </tr>
  );
}

// ── Fraud table row ──────────────────────────────────────────────────────────

function FraudRow({ row, brandName }: { row: FraudFlaggedRow; brandName: string }) {
  return (
    <tr>
      <td className='px-4 py-2.5 font-medium text-gray-900'>{row.playerId}</td>
      <td className='px-4 py-2.5 text-gray-700'>{brandName}</td>
      <td className='px-4 py-2.5 text-gray-700'>{row.country || '—'}</td>
      <td className='px-4 py-2.5 text-gray-700 text-xs'>{row.lastFraudFlag || '—'}</td>
      <td className='px-4 py-2.5 text-gray-700 text-xs'>{fmtDate(row.lastFraudFlagAt)}</td>
      <td className='px-4 py-2.5 text-gray-700 text-xs'>{fmtDate(row.registeredAt)}</td>
    </tr>
  );
}

// ── Drilldown modal ──────────────────────────────────────────────────────────
// Lists a referrer's referrals with inline manual actions (approve / reject /
// freeze). Each action is a POST to the corresponding admin endpoint; on
// success we invalidate `refer-referrals-by-player` (this drilldown) and
// `refer-top-referrers` (parent table) so the counts update without a reload.

function ReferrerDrilldownModal({
  referrerPlayerId,
  brands,
  onClose,
}: {
  referrerPlayerId: string;
  brands: Brand[];
  onClose: () => void;
}) {
  // The /referrals endpoint doesn't filter by referrer — pull a wide page and
  // slice client-side. For the leaderboard volume a top referrer might have
  // ~50 referrals, well inside the 200 cap.
  const { data, isLoading } = useBaseQuery<ReferralsResponse>({
    endpoint: REFER_API_URLS.REFERRALS(),
    queryKey: ['refer-referrals-by-player', referrerPlayerId],
    params: { limit: 200 },
  });

  const referrals = useMemo(
    () =>
      (data?.referrals ?? []).filter((r) => r.referrerPlayerId === referrerPlayerId),
    [data, referrerPlayerId],
  );

  const brandName = (id: string) => brands.find((b) => b._id === id)?.name ?? id.slice(-6);

  return (
    <div className='fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/50 backdrop-blur-sm p-4 sm:p-8'>
      <div className='bg-white/95 backdrop-blur-md rounded-xl shadow-xl w-full max-w-4xl border border-violet-100 my-8'>
        <div className='p-5 border-b border-violet-100 flex items-start justify-between'>
          <div>
            <p className='text-xs font-semibold uppercase tracking-wider text-gray-600'>Referrer</p>
            <h3 className='text-base font-semibold text-gray-900 mt-0.5'>{referrerPlayerId}</h3>
            <p className='text-xs text-gray-700 mt-0.5'>
              {referrals.length} referral{referrals.length === 1 ? '' : 's'}
            </p>
          </div>
          <button
            onClick={onClose}
            className='text-gray-600 hover:text-gray-700 text-2xl leading-none'
          >
            ×
          </button>
        </div>

        <div className='p-5'>
          {isLoading && <p className='text-sm text-gray-700'>Loading…</p>}

          {!isLoading && referrals.length === 0 && (
            <p className='text-sm text-gray-700'>No referrals visible for this player.</p>
          )}

          {referrals.length > 0 && (
            <div className='space-y-2 max-h-[60vh] overflow-y-auto pr-1'>
              {referrals.map((r) => (
                <ReferralActionRow
                  key={r._id}
                  referral={r}
                  brandName={brandName(r.brandId)}
                  referrerPlayerId={referrerPlayerId}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Per-referral action row ──────────────────────────────────────────────────

const STATUS_TONE: Record<string, string> = {
  pending_ftd:           'bg-gray-100 text-gray-600',
  pending_qualification: 'bg-yellow-100 text-yellow-700',
  qualified:             'bg-violet-100 text-violet-700',
  rewarded:              'bg-green-100 text-green-700',
  reversed:              'bg-orange-100 text-orange-700',
  rejected:              'bg-red-100 text-red-700',
};

function ReferralActionRow({
  referral,
  brandName,
  referrerPlayerId,
}: {
  referral: PlayerReferral & { frozen?: boolean };
  brandName: string;
  referrerPlayerId: string;
}) {
  const queryClient = useQueryClient();
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['refer-referrals-by-player', referrerPlayerId] });
    queryClient.invalidateQueries({ queryKey: ['refer-top-referrers'] });
    queryClient.invalidateQueries({ queryKey: ['refer-referrals'] });
  };

  const approveMut = useBaseMutation({
    endpoint: REFER_API_URLS.REFERRAL_APPROVE(referral._id),
    method: 'post',
    onSuccess: refresh,
    onError: (err: any) =>
      alert(err?.response?.data?.error || err?.message || 'Approve failed'),
  });
  const rejectMut = useBaseMutation({
    endpoint: REFER_API_URLS.REFERRAL_REJECT(referral._id),
    method: 'post',
    onSuccess: refresh,
    onError: (err: any) =>
      alert(err?.response?.data?.error || err?.message || 'Reject failed'),
  });
  const freezeMut = useBaseMutation({
    endpoint: REFER_API_URLS.REFERRAL_FREEZE(referral._id),
    method: 'post',
    onSuccess: refresh,
    onError: (err: any) =>
      alert(err?.response?.data?.error || err?.message || 'Freeze failed'),
  });

  const isTerminal = ['rewarded', 'reversed', 'rejected'].includes(referral.status);
  const isPending = ['pending_ftd', 'pending_qualification', 'qualified'].includes(referral.status);
  const isFrozen = !!referral.frozen;

  return (
    <div className='border border-violet-100 rounded-lg p-3 bg-white'>
      <div className='flex items-center justify-between gap-3'>
        <div className='min-w-0 flex-1'>
          <div className='flex items-center gap-2 flex-wrap'>
            <span className='text-sm font-medium text-gray-900 truncate'>
              {referral.refereePlayerId}
            </span>
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_TONE[referral.status] || 'bg-gray-100 text-gray-600'}`}>
              {referral.status.replace(/_/g, ' ')}
            </span>
            {isFrozen && (
              <span className='inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700'>
                frozen
              </span>
            )}
          </div>
          <p className='text-[11px] text-gray-600 mt-0.5'>
            {brandName} · FTD {fmtDate(referral.ftdAt)}
            {referral.rejectionReason ? ` · rejected: ${referral.rejectionReason}` : ''}
          </p>
        </div>

        <div className='flex items-center gap-1.5 shrink-0'>
          <button
            disabled={!isPending || isFrozen || approveMut.isPending}
            onClick={() => {
              if (!confirm('Approve this referral? It will move to qualified and the reward pipeline will run.')) return;
              approveMut.mutate({});
            }}
            className='px-2.5 py-1 text-xs font-medium rounded-md bg-green-50 text-green-700 border border-green-100 hover:bg-green-100 disabled:opacity-40 disabled:cursor-not-allowed'
          >
            {approveMut.isPending ? '…' : 'Approve'}
          </button>
          <button
            disabled={isTerminal || rejectMut.isPending}
            onClick={() => {
              const reason = prompt('Rejection reason (optional):', 'manual_reject') || 'manual_reject';
              rejectMut.mutate({ reason });
            }}
            className='px-2.5 py-1 text-xs font-medium rounded-md bg-red-50 text-red-700 border border-red-100 hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed'
          >
            {rejectMut.isPending ? '…' : 'Reject'}
          </button>
          <button
            disabled={['reversed', 'rejected'].includes(referral.status) || freezeMut.isPending}
            onClick={() => {
              if (isFrozen) {
                freezeMut.mutate({ frozen: false });
                return;
              }
              const reason = prompt('Freeze reason (optional):', 'manual_freeze') || 'manual_freeze';
              freezeMut.mutate({ frozen: true, reason });
            }}
            className='px-2.5 py-1 text-xs font-medium rounded-md bg-blue-50 text-blue-700 border border-blue-100 hover:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed'
          >
            {freezeMut.isPending ? '…' : isFrozen ? 'Unfreeze' : 'Freeze'}
          </button>
        </div>
      </div>
    </div>
  );
}
