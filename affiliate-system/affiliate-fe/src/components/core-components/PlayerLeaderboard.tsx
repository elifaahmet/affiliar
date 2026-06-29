import { useState } from 'react';
import { useBaseQuery } from 'api/core/useBaseQuery';

// Top-50 player ranking, switchable by metric. Reuses the /api/players endpoint
// (metric-sorted, scoped server-side: operators see the whole tenant, affiliates
// only their own players).
interface AffiliateRef { username?: string; email?: string; name?: string }
interface PlayerRow {
  playerId: string;
  affiliateId?: AffiliateRef | string | null;
  metrics?: Record<string, number | string | null> | null;
}

const METRICS = [
  { key: 'ngrCents', label: 'NGR', money: true },
  { key: 'ggrCents', label: 'GGR', money: true },
  { key: 'ftdSumCents', label: 'FTD Sum', money: true },
  { key: 'ftdCount', label: 'FTDs', money: false },
  { key: 'depositsSumCents', label: 'Deposits', money: true },
  { key: 'wagerCents', label: 'Wager', money: true },
  { key: 'cashoutsSumCents', label: 'Cashout', money: true },
] as const;

const eur = (c: number | string | null | undefined) =>
  `€${(Number(c || 0) / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
const fmt = (v: number | string | null | undefined, money: boolean) => (money ? eur(v) : String(Number(v || 0)));
const MEDAL = ['🥇', '🥈', '🥉'];

export default function PlayerLeaderboard({ endpoint, scope }: { endpoint: string; scope: 'operator' | 'affiliate' }) {
  const [metric, setMetric] = useState<string>('ngrCents');

  const { data, isLoading } = useBaseQuery<{ players: PlayerRow[] }>({
    endpoint,
    queryKey: ['player-leaderboard', endpoint, metric],
    params: { sortBy: metric, sortDir: 'desc', limit: 50, page: 1 },
  });
  const players = data?.players ?? [];
  const affName = (a: PlayerRow['affiliateId']) =>
    a && typeof a === 'object' ? a.name || a.username || a.email || '—' : '—';

  return (
    <div className='bg-white/80 backdrop-blur-sm rounded-xl border border-violet-100 overflow-hidden'>
      <div className='px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap'>
        <p className='text-sm font-medium text-gray-800'>🏆 Top 50 players</p>
        <div className='flex rounded-lg border border-gray-200 overflow-hidden text-xs'>
          {METRICS.map((m) => (
            <button key={m.key} onClick={() => setMetric(m.key)}
              className={`px-3 py-1.5 font-medium ${metric === m.key ? 'bg-primary text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <p className='p-6 text-sm text-gray-600'>Loading…</p>
      ) : players.length === 0 ? (
        <p className='p-6 text-sm text-gray-600'>No player activity yet.</p>
      ) : (
        <div className='overflow-x-auto'>
          <table className='w-full text-sm'>
            <thead className='bg-gray-50'>
              <tr>
                <th className='px-4 py-2.5 text-left text-xs font-semibold text-gray-700 w-12'>#</th>
                <th className='px-4 py-2.5 text-left text-xs font-semibold text-gray-700'>Player</th>
                {scope === 'operator' && <th className='px-4 py-2.5 text-left text-xs font-semibold text-gray-700'>Affiliate</th>}
                {METRICS.map((m) => (
                  <th key={m.key} className={`px-4 py-2.5 text-right text-xs font-semibold whitespace-nowrap ${metric === m.key ? 'text-primary' : 'text-gray-700'}`}>
                    {m.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className='divide-y divide-gray-100'>
              {players.map((p, i) => (
                <tr key={p.playerId} className={i < 3 ? 'bg-violet-50/40' : ''}>
                  <td className='px-4 py-2 text-sm'>{i < 3 ? MEDAL[i] : <span className='text-gray-400 text-xs'>{i + 1}</span>}</td>
                  <td className='px-4 py-2 text-xs font-medium text-gray-800 truncate max-w-[180px]'>{p.playerId}</td>
                  {scope === 'operator' && <td className='px-4 py-2 text-xs text-gray-600 truncate max-w-[160px]'>{affName(p.affiliateId)}</td>}
                  {METRICS.map((m) => (
                    <td key={m.key} className={`px-4 py-2 text-right text-xs whitespace-nowrap ${metric === m.key ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>
                      {fmt(p.metrics?.[m.key], m.money)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
