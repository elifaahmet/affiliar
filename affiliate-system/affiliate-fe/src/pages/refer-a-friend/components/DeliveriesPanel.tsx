import { useBaseQuery } from 'api/core/useBaseQuery';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowPathIcon } from '@heroicons/react/24/outline';

import { REFER_API_URLS } from 'config/apiUrls';
import type { DeliveriesResponse, DeliveryStatus } from '../types';

interface Props {
  brandId: string;
}

// Pull-model ledger: 'pending' = waiting for the casino backend to
// pull this row when the player visits their "My Rewards" page;
// 'delivered' = casino confirmed receipt + claimed.
const STATUS_BADGE: Record<DeliveryStatus, string> = {
  pending:   'bg-yellow-100 text-yellow-700',
  delivered: 'bg-green-100 text-green-700',
  failed:    'bg-red-100 text-red-700',
};

const STATUS_LABEL: Record<DeliveryStatus, string> = {
  pending:   'Awaiting pickup',
  delivered: 'Claimed',
  failed:    'Failed',
};

const EVENT_BADGE: Record<string, string> = {
  'referral.reward.issued':            'bg-violet-100 text-violet-700',
  'referral.reward.reversed':          'bg-orange-100 text-orange-700',
  'referral.reward.referee.issued':    'bg-fuchsia-100 text-fuchsia-700',
  'referral.reward.referee.reversed':  'bg-amber-100 text-amber-700',
  'referral.reward.recurring.issued':  'bg-emerald-100 text-emerald-700',
};

function formatRelative(iso: string | null) {
  if (!iso) return '—';
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return '—';
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1)   return 'just now';
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  return new Date(iso).toLocaleDateString();
}

function formatAmount(cents: number | null, currency: string | null) {
  if (cents == null) return '—';
  return `${currency || ''} ${(cents / 100).toFixed(2)}`.trim();
}

export default function DeliveriesPanel({ brandId }: Props) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useBaseQuery<DeliveriesResponse>({
    endpoint: REFER_API_URLS.DELIVERIES(),
    queryKey: ['refer-deliveries', brandId],
    params: { brandId, limit: 20 },
  });

  const deliveries = data?.deliveries ?? [];

  return (
    <div className='space-y-3'>
      <div className='flex items-center justify-between'>
        <h3 className='text-sm font-semibold text-gray-900'>Reward ledger</h3>
        <button
          type='button'
          onClick={() => queryClient.invalidateQueries({ queryKey: ['refer-deliveries', brandId] })}
          className='inline-flex items-center gap-1 text-xs font-medium text-violet-700 hover:text-violet-900'
        >
          <ArrowPathIcon className='h-3.5 w-3.5' />
          Refresh
        </button>
      </div>

      {isLoading && <p className='text-xs text-gray-500'>Loading…</p>}

      {!isLoading && deliveries.length === 0 && (
        <p className='text-xs text-gray-500'>
          No rewards yet. Rows show up here when a referral qualifies — the casino backend pulls them on the player&rsquo;s next visit.
        </p>
      )}

      {deliveries.length > 0 && (
        <div className='overflow-hidden rounded-lg border border-violet-100 bg-white'>
          <table className='w-full text-xs'>
            <thead>
              <tr className='bg-violet-50/60 text-left text-[10px] uppercase tracking-wider text-gray-500'>
                <th className='px-3 py-2 font-semibold'>Event</th>
                <th className='px-3 py-2 font-semibold'>Status</th>
                <th className='px-3 py-2 font-semibold text-right'>Amount</th>
                <th className='px-3 py-2 font-semibold'>Recipient</th>
                <th className='px-3 py-2 font-semibold'>Queued</th>
                <th className='px-3 py-2 font-semibold'>Claimed</th>
              </tr>
            </thead>
            <tbody className='divide-y divide-violet-50'>
              {deliveries.map((d) => {
                const data = d.payload?.data;
                const recipient =
                  d.eventType.startsWith('referral.reward.referee.')
                    ? data?.refereePlayerId
                    : data?.referrerPlayerId;
                const rewardCents = data?.rewardCents ?? null;
                const rewardCurrency = data?.rewardCurrency ?? null;
                return (
                  <tr key={d._id} className='hover:bg-violet-50/30'>
                    <td className='px-3 py-2'>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded font-medium ${EVENT_BADGE[d.eventType] ?? 'bg-gray-100 text-gray-600'}`}>
                        {d.eventType.replace('referral.reward.', '')}
                      </span>
                    </td>
                    <td className='px-3 py-2'>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded font-medium ${STATUS_BADGE[d.status]}`}>
                        {STATUS_LABEL[d.status]}
                      </span>
                    </td>
                    <td className='px-3 py-2 text-right tabular-nums text-gray-700'>
                      {formatAmount(rewardCents ?? null, rewardCurrency ?? null)}
                    </td>
                    <td className='px-3 py-2 text-gray-600 font-mono text-[11px]'>
                      {recipient || '—'}
                    </td>
                    <td className='px-3 py-2 text-gray-600' title={d.createdAt || ''}>
                      {formatRelative(d.createdAt)}
                    </td>
                    <td className='px-3 py-2 text-gray-600' title={d.deliveredAt || ''}>
                      {formatRelative(d.deliveredAt)}
                    </td>
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
