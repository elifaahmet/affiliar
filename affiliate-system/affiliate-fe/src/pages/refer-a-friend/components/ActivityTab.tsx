import { useMemo, useState } from 'react';
import { useBaseQuery } from 'api/core/useBaseQuery';
import StyledSelect from '@components/core-components/StyledSelect';
import { REFER_API_URLS } from 'config/apiUrls';

import type {
  Brand,
  PlayerReferral,
  ReferralStatus,
  ReferralsResponse,
  ReferralDetailResponse,
} from '../types';

interface Props {
  brands: Brand[];
}

const STATUS_LABEL: Record<ReferralStatus, string> = {
  pending_ftd:           'Awaiting FTD',
  pending_qualification: 'Pending qualification',
  qualified:             'Qualified',
  rewarded:              'Rewarded',
  reversed:              'Reversed',
  rejected:              'Rejected',
};

const STATUS_BADGE: Record<ReferralStatus, string> = {
  pending_ftd:           'bg-gray-100 text-gray-600',
  pending_qualification: 'bg-yellow-100 text-yellow-700',
  qualified:             'bg-violet-100 text-violet-700',
  rewarded:              'bg-green-100 text-green-700',
  reversed:              'bg-orange-100 text-orange-700',
  rejected:              'bg-red-100 text-red-700',
};

const STATUS_FILTERS: Array<{ key: ReferralStatus | 'all'; label: string }> = [
  { key: 'all',                   label: 'All' },
  { key: 'pending_ftd',           label: 'Awaiting FTD' },
  { key: 'pending_qualification', label: 'Qualifying' },
  { key: 'qualified',             label: 'Qualified' },
  { key: 'rewarded',              label: 'Rewarded' },
  { key: 'reversed',              label: 'Reversed' },
  { key: 'rejected',              label: 'Rejected' },
];

function fmtCents(cents: number | null | undefined, currency: string | null | undefined) {
  if (cents == null) return '—';
  const amount = (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${currency || ''} ${amount}`.trim();
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
}

export default function ActivityTab({ brands }: Props) {
  const [brandId, setBrandId] = useState<string>('');
  const [status, setStatus] = useState<ReferralStatus | 'all'>('all');
  const [selected, setSelected] = useState<PlayerReferral | null>(null);

  const { data, isLoading } = useBaseQuery<ReferralsResponse>({
    endpoint: REFER_API_URLS.REFERRALS(),
    queryKey: ['refer-referrals', brandId, status],
    params: {
      ...(brandId ? { brandId } : {}),
      ...(status !== 'all' ? { status } : {}),
      limit: 100,
    },
  });

  const referrals = data?.referrals ?? [];

  const brandName = (id: string) => brands.find((b) => b._id === id)?.name ?? id.slice(-6);

  return (
    <div className='space-y-4'>
      {/* Filters */}
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
        <div className='flex flex-wrap gap-1'>
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setStatus(f.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                status === f.key
                  ? 'bg-primary text-white'
                  : 'text-gray-600 hover:bg-violet-50 hover:text-violet-900'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className='bg-white/80 backdrop-blur-sm rounded-xl border border-violet-100 overflow-hidden'>
        {isLoading && <p className='p-6 text-sm text-gray-700'>Loading…</p>}

        {!isLoading && referrals.length === 0 && (
          <p className='p-6 text-sm text-gray-700'>No referrals match these filters.</p>
        )}

        {referrals.length > 0 && (
          <table className='w-full text-sm'>
            <thead>
              <tr className='bg-violet-50/60 text-left text-[11px] uppercase tracking-wider text-gray-700'>
                <th className='px-4 py-2.5 font-semibold'>Brand</th>
                <th className='px-4 py-2.5 font-semibold'>Referrer</th>
                <th className='px-4 py-2.5 font-semibold'>Referee</th>
                <th className='px-4 py-2.5 font-semibold'>Status</th>
                <th className='px-4 py-2.5 font-semibold text-right'>FTD</th>
                <th className='px-4 py-2.5 font-semibold text-right'>NGR</th>
                <th className='px-4 py-2.5 font-semibold text-right'>%</th>
                <th className='px-4 py-2.5 font-semibold text-right'>Reward</th>
                <th className='px-4 py-2.5 font-semibold'>FTD date</th>
              </tr>
            </thead>
            <tbody className='divide-y divide-violet-50'>
              {referrals.map((r) => (
                <tr
                  key={r._id}
                  className='cursor-pointer hover:bg-violet-50/30'
                  onClick={() => setSelected(r)}
                >
                  <td className='px-4 py-2.5 text-gray-700'>{brandName(r.brandId)}</td>
                  <td className='px-4 py-2.5 font-medium text-gray-900'>{r.referrerPlayerId}</td>
                  <td className='px-4 py-2.5 text-gray-700'>{r.refereePlayerId}</td>
                  <td className='px-4 py-2.5'>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[r.status]}`}>
                      {STATUS_LABEL[r.status]}
                    </span>
                  </td>
                  <td className='px-4 py-2.5 text-right tabular-nums text-gray-700'>
                    {fmtCents(r.ftdCents, r.ftdCurrency)}
                  </td>
                  <td className='px-4 py-2.5 text-right tabular-nums text-gray-700'>
                    {r.recurringNgrCents != null
                      ? fmtCents(r.recurringNgrCents, r.rewardCurrency)
                      : '—'}
                  </td>
                  <td className='px-4 py-2.5 text-right tabular-nums text-gray-700'>
                    {r.recurringPercent != null ? `${r.recurringPercent}%` : '—'}
                  </td>
                  <td className='px-4 py-2.5 text-right tabular-nums font-semibold text-gray-900'>
                    {fmtCents(
                      r.recurringRewardCents ? r.recurringRewardCents : r.rewardCents,
                      r.rewardCurrency,
                    )}
                  </td>
                  <td className='px-4 py-2.5 text-gray-700 text-xs'>{fmtDate(r.ftdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selected && <ReferralDetailModal referral={selected} brandName={brandName(selected.brandId)} onClose={() => setSelected(null)} />}
    </div>
  );
}

function ReferralDetailModal({
  referral,
  brandName,
  onClose,
}: {
  referral: PlayerReferral;
  brandName: string;
  onClose: () => void;
}) {
  const { data } = useBaseQuery<ReferralDetailResponse>({
    endpoint: REFER_API_URLS.REFERRAL(referral._id),
    queryKey: ['refer-referral', referral._id],
  });

  const detail = data?.referral ?? referral;
  const deliveries = data?.deliveries ?? [];

  return (
    <div className='fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/50 backdrop-blur-sm p-4 sm:p-8'>
      <div className='bg-white/95 backdrop-blur-md rounded-xl shadow-xl w-full max-w-2xl border border-violet-100 my-8'>
        <div className='p-5 border-b border-violet-100 flex items-start justify-between'>
          <div>
            <p className='text-xs font-semibold uppercase tracking-wider text-gray-600'>Referral</p>
            <h3 className='text-base font-semibold text-gray-900 mt-0.5'>
              {detail.referrerPlayerId} → {detail.refereePlayerId}
            </h3>
            <p className='text-xs text-gray-700 mt-0.5'>{brandName}</p>
          </div>
          <button onClick={onClose} className='text-gray-600 hover:text-gray-700 text-2xl leading-none'>×</button>
        </div>

        <div className='p-5 space-y-5'>
          <div className='grid grid-cols-2 sm:grid-cols-3 gap-3'>
            <DetailField label='Status'>
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[detail.status]}`}>
                {STATUS_LABEL[detail.status]}
              </span>
            </DetailField>
            <DetailField label='Refcode'>{detail.refCode || '—'}</DetailField>
            <DetailField label='Signed up'>{fmtDate(detail.signedUpAt)}</DetailField>
            <DetailField label='FTD'>{fmtCents(detail.ftdCents, detail.ftdCurrency)}</DetailField>
            <DetailField label='FTD date'>{fmtDate(detail.ftdAt)}</DetailField>
            <DetailField label='Qualified at'>{fmtDate(detail.qualifiedAt)}</DetailField>
            <DetailField label='Referrer reward'>{fmtCents(detail.rewardCents, detail.rewardCurrency)}</DetailField>
            <DetailField label='Referrer paid at'>{fmtDate(detail.rewardedAt)}</DetailField>
            <DetailField label='Referee reward'>{fmtCents(detail.refereeRewardCents, detail.refereeRewardCurrency)}</DetailField>
            <DetailField label='Referee paid at'>{fmtDate(detail.refereeRewardedAt)}</DetailField>
            <DetailField label='Reversed at'>{fmtDate(detail.reversedAt)}</DetailField>
          </div>

          {detail.rejectionReason && (
            <div className='rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-800'>
              <span className='font-semibold'>Rejection reason:</span> {detail.rejectionReason}
            </div>
          )}
          {detail.reversalReason && (
            <div className='rounded-lg bg-orange-50 border border-orange-100 px-3 py-2 text-xs text-orange-800'>
              <span className='font-semibold'>Reversal reason:</span> {detail.reversalReason}
            </div>
          )}

          <div>
            <h4 className='text-sm font-semibold text-gray-900 mb-2'>Delivery history</h4>
            {deliveries.length === 0 && (
              <p className='text-xs text-gray-700'>No deliveries on record.</p>
            )}
            {deliveries.length > 0 && (
              <div className='space-y-2'>
                {deliveries.map((d) => (
                  <div key={d._id} className='border border-violet-100 rounded-lg p-3 bg-white'>
                    <div className='flex items-center justify-between'>
                      <div className='flex items-center gap-2'>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          d.status === 'delivered'
                            ? 'bg-green-100 text-green-700'
                            : d.status === 'failed'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {d.status}
                        </span>
                        <span className='text-xs text-gray-600'>
                          {d.eventType.replace('referral.reward.', '')} · attempt {d.attempts}/6
                        </span>
                      </div>
                      <span className='text-[11px] text-gray-600'>{fmtDate(d.createdAt)}</span>
                    </div>
                    {d.lastResponse && (
                      <div className='mt-2 text-[11px] text-gray-700'>
                        {d.lastResponse.statusCode != null && <span>HTTP {d.lastResponse.statusCode} · </span>}
                        {d.lastResponse.latencyMs != null && <span>{d.lastResponse.latencyMs}ms · </span>}
                        {d.lastResponse.errorMessage && <span className='text-red-600'>{d.lastResponse.errorMessage}</span>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className='text-[10px] font-semibold uppercase tracking-wider text-gray-600 mb-1'>{label}</p>
      <div className='text-sm text-gray-900'>{children}</div>
    </div>
  );
}
