import { useState } from 'react';
import { useBaseQuery } from 'api/core/useBaseQuery';
import { AFFILIATE_PORTAL_API_URLS } from 'config/apiUrls';

function fmt(cents: number) {
  return (cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString();
}

interface PlayerMetrics {
  depositsCount: number;
  depositsSumCents: number;
  ftdCount: number;
  ftdSumCents: number;
  cashoutsCount: number;
  cashoutsSumCents: number;
  betsSumCents: number;
  winsSumCents: number;
  wagerCents: number;
  roundsCount: number;
  ngrCents: number;
  ggrCents: number;
  lastActivityAt?: string;
}

interface PlayerRow {
  _id: string;
  playerId: string;
  country: string | null;
  currency: string | null;
  affiliateCode: string | null;
  campaign: string | null;
  subId: string | null;
  registeredAt: string;
  status?: string;
  statusUpdatedAt?: string;
  metrics: PlayerMetrics | null;
}

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-green-50 text-green-700',
  disabled: 'bg-red-50 text-red-700',
  self_excluded: 'bg-orange-50 text-orange-700',
  unverified: 'bg-yellow-50 text-yellow-700',
  duplicate: 'bg-gray-100 text-gray-700',
};

function StatusBadge({ status }: { status?: string }) {
  const label = status || 'active';
  const cls = STATUS_STYLES[label] || 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${cls}`}>
      {label.replace(/_/g, ' ')}
    </span>
  );
}

interface PlayersResponse {
  players: PlayerRow[];
  total: number;
  page: number;
  limit: number;
}

export default function AffiliatePlayers() {
  const [page, setPage] = useState(1);
  const limit = 50;

  const { data, isLoading, isError } = useBaseQuery<PlayersResponse>({
    endpoint: AFFILIATE_PORTAL_API_URLS.PLAYERS(),
    queryKey: ['affiliate-players', page],
    params: { page, limit },
  });

  const players = data?.players ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className='bg-gray-100 h-full overflow-auto p-6 pb-24 space-y-6'>
      <div className='bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden'>
        <div className='px-5 py-3 border-b border-gray-100 flex items-center justify-between'>
          <p className='text-sm font-semibold text-gray-800'>My Players</p>
          <p className='text-xs text-gray-400'>{total} total</p>
        </div>

        {isLoading && (
          <div className='p-8 text-center'>
            <p className='text-sm text-gray-400'>Loading...</p>
          </div>
        )}

        {isError && (
          <div className='p-8 text-center'>
            <p className='text-sm text-red-500'>Failed to load players.</p>
          </div>
        )}

        {!isLoading && !isError && players.length === 0 && (
          <div className='p-8 text-center'>
            <p className='text-sm text-gray-400'>
              No players yet. Players who register with your referral code will appear here.
            </p>
          </div>
        )}

        {!isLoading && !isError && players.length > 0 && (
          <div className='overflow-x-auto'>
            <table className='w-full'>
              <thead className='bg-gray-50'>
                <tr>
                  <th className='px-4 py-3 text-left text-xs font-semibold text-gray-500'>Player ID</th>
                  <th className='px-4 py-3 text-left text-xs font-semibold text-gray-500'>Status</th>
                  <th className='px-4 py-3 text-left text-xs font-semibold text-gray-500'>Code</th>
                  <th className='px-4 py-3 text-left text-xs font-semibold text-gray-500'>Campaign</th>
                  <th className='px-4 py-3 text-left text-xs font-semibold text-gray-500'>Country</th>
                  <th className='px-4 py-3 text-left text-xs font-semibold text-gray-500'>Currency</th>
                  <th className='px-4 py-3 text-left text-xs font-semibold text-gray-500'>Registered</th>
                  <th className='px-4 py-3 text-right text-xs font-semibold text-gray-500'>Deposits</th>
                  <th className='px-4 py-3 text-right text-xs font-semibold text-gray-500'>FTD</th>
                  <th className='px-4 py-3 text-right text-xs font-semibold text-gray-500'>NGR</th>
                  <th className='px-4 py-3 text-left text-xs font-semibold text-gray-500'>Last Activity</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-gray-100'>
                {players.map((p, i) => (
                  <tr key={p._id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className='px-4 py-3 text-xs font-mono text-gray-700 whitespace-nowrap'>
                      {p.playerId}
                    </td>
                    <td className='px-4 py-3 whitespace-nowrap'>
                      <StatusBadge status={p.status} />
                    </td>
                    <td className='px-4 py-3 text-xs text-gray-700'>{p.affiliateCode ?? '—'}</td>
                    <td className='px-4 py-3 text-xs text-gray-700'>{p.campaign ?? '—'}</td>
                    <td className='px-4 py-3 text-xs text-gray-700'>{p.country ?? '—'}</td>
                    <td className='px-4 py-3 text-xs text-gray-700'>{p.currency ?? '—'}</td>
                    <td className='px-4 py-3 text-xs text-gray-700'>{fmtDate(p.registeredAt)}</td>
                    <td className='px-4 py-3 text-xs text-right text-gray-700'>
                      {p.metrics
                        ? `${p.metrics.depositsCount} / ${fmt(p.metrics.depositsSumCents)}`
                        : '—'}
                    </td>
                    <td className='px-4 py-3 text-xs text-right text-gray-700'>
                      {p.metrics && p.metrics.ftdCount > 0 ? fmt(p.metrics.ftdSumCents) : '—'}
                    </td>
                    <td className='px-4 py-3 text-xs text-right text-gray-700'>
                      {p.metrics ? fmt(p.metrics.ngrCents) : '—'}
                    </td>
                    <td className='px-4 py-3 text-xs text-gray-700'>
                      {p.metrics?.lastActivityAt ? fmtDate(p.metrics.lastActivityAt) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pages > 1 && (
          <div className='px-5 py-3 border-t border-gray-100 flex items-center justify-between'>
            <p className='text-xs text-gray-500'>
              Page {page} of {pages}
            </p>
            <div className='flex gap-2'>
              <button
                type='button'
                className='px-3 py-1 text-xs rounded border border-gray-200 text-gray-700 disabled:opacity-50'
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Previous
              </button>
              <button
                type='button'
                className='px-3 py-1 text-xs rounded border border-gray-200 text-gray-700 disabled:opacity-50'
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
                disabled={page >= pages}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
