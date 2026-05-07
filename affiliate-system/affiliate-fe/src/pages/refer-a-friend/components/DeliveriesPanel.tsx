import { useState } from 'react';
import { useBaseQuery } from 'api/core/useBaseQuery';
import { baseService } from 'api/core/baseService';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowPathIcon } from '@heroicons/react/24/outline';

import { REFER_API_URLS } from 'config/apiUrls';
import type { DeliveriesResponse, DeliveryStatus } from '../types';

interface Props {
  brandId: string;
}

const STATUS_BADGE: Record<DeliveryStatus, string> = {
  pending:   'bg-yellow-100 text-yellow-700',
  delivered: 'bg-green-100 text-green-700',
  failed:    'bg-red-100 text-red-700',
};

const EVENT_BADGE: Record<string, string> = {
  'referral.reward.issued':   'bg-violet-100 text-violet-700',
  'referral.reward.reversed': 'bg-orange-100 text-orange-700',
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

export default function DeliveriesPanel({ brandId }: Props) {
  const queryClient = useQueryClient();
  const [replayingId, setReplayingId] = useState<string | null>(null);

  const { data, isLoading } = useBaseQuery<DeliveriesResponse>({
    endpoint: REFER_API_URLS.DELIVERIES(),
    queryKey: ['refer-deliveries', brandId],
    params: { brandId, limit: 20 },
  });

  async function handleReplay(id: string) {
    try {
      setReplayingId(id);
      await baseService.add(REFER_API_URLS.REPLAY(id), {});
      queryClient.invalidateQueries({ queryKey: ['refer-deliveries', brandId] });
    } finally {
      setReplayingId(null);
    }
  }

  const deliveries = data?.deliveries ?? [];

  return (
    <div className='space-y-3'>
      <div className='flex items-center justify-between'>
        <h3 className='text-sm font-semibold text-gray-900'>Recent deliveries</h3>
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
          No deliveries yet. Send a test event after generating a signing secret.
        </p>
      )}

      {deliveries.length > 0 && (
        <div className='overflow-hidden rounded-lg border border-violet-100 bg-white'>
          <table className='w-full text-xs'>
            <thead>
              <tr className='bg-violet-50/60 text-left text-[10px] uppercase tracking-wider text-gray-500'>
                <th className='px-3 py-2 font-semibold'>Event</th>
                <th className='px-3 py-2 font-semibold'>Status</th>
                <th className='px-3 py-2 font-semibold text-right'>Attempts</th>
                <th className='px-3 py-2 font-semibold'>Last attempt</th>
                <th className='px-3 py-2 font-semibold'>Latency</th>
                <th className='px-3 py-2 font-semibold'>HTTP</th>
                <th className='px-3 py-2'></th>
              </tr>
            </thead>
            <tbody className='divide-y divide-violet-50'>
              {deliveries.map((d) => (
                <tr key={d._id} className='hover:bg-violet-50/30'>
                  <td className='px-3 py-2'>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded font-medium ${EVENT_BADGE[d.eventType] ?? 'bg-gray-100 text-gray-600'}`}>
                      {d.eventType.replace('referral.reward.', '')}
                    </span>
                  </td>
                  <td className='px-3 py-2'>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded font-medium ${STATUS_BADGE[d.status]}`}>
                      {d.status}
                    </span>
                  </td>
                  <td className='px-3 py-2 text-right tabular-nums'>{d.attempts} / 6</td>
                  <td className='px-3 py-2 text-gray-600' title={d.lastAttemptAt || ''}>
                    {formatRelative(d.lastAttemptAt)}
                  </td>
                  <td className='px-3 py-2 text-gray-600 tabular-nums'>
                    {d.lastResponse?.latencyMs != null ? `${d.lastResponse.latencyMs}ms` : '—'}
                  </td>
                  <td className='px-3 py-2 text-gray-600 tabular-nums'>
                    {d.lastResponse?.statusCode ?? d.lastResponse?.errorMessage?.slice(0, 24) ?? '—'}
                  </td>
                  <td className='px-3 py-2 text-right'>
                    {d.status === 'failed' && (
                      <button
                        type='button'
                        onClick={() => handleReplay(d._id)}
                        disabled={replayingId === d._id}
                        className='text-xs font-medium text-violet-700 hover:text-violet-900 disabled:opacity-50'
                      >
                        {replayingId === d._id ? 'Replaying…' : 'Replay'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
