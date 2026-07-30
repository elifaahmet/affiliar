import { useState } from 'react';
import { useBaseQuery } from 'api/core/useBaseQuery';

// Top-50 player ranking, switchable by metric. Reuses the /api/players endpoint
// (metric-sorted, scoped server-side: operators see the whole tenant, affiliates
// only their own players).
interface AffiliateRef { username?: string; email?: string; name?: string }
interface PlayerRow {
  playerId: string;
  username?: string | null;
  affiliateId?: AffiliateRef | string | null;
  metrics?: Record<string, number | string | null> | null;
}

const METRICS = [
  { key: 'ngrCents', label: 'NGR', money: true },
  { key: 'ggrCents', label: 'GGR', money: true },
  { key: 'ftdSumCents', label: 'FTD', money: true },
  { key: 'depositsSumCents', label: 'Deposits', money: true },
  { key: 'wagerCents', label: 'Wager', money: true },
  { key: 'cashoutsSumCents', label: 'Cashout', money: true },
] as const;

const eur = (c: number | string | null | undefined) =>
  `€${(Number(c || 0) / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
const fmt = (v: number | string | null | undefined, money: boolean) => (money ? eur(v) : String(Number(v || 0)));
const MEDAL = ['🥇', '🥈', '🥉'];

const PERIODS = [
  ['this_month', 'This month'],
  ['last_7', 'Last 7 days'],
  ['last_30', 'Last 30 days'],
  ['this_year', 'This year'],
  ['all', 'All time'],
] as const;

const ymd = (d: Date) => d.toISOString().slice(0, 10);
function rangeFor(p: string): { from?: string; to?: string } {
  const now = new Date();
  const y = now.getUTCFullYear(), m = now.getUTCMonth(), d = now.getUTCDate();
  const today = ymd(new Date(Date.UTC(y, m, d)));
  if (p === 'this_month') return { from: ymd(new Date(Date.UTC(y, m, 1))), to: today };
  if (p === 'last_7') return { from: ymd(new Date(Date.UTC(y, m, d - 6))), to: today };
  if (p === 'last_30') return { from: ymd(new Date(Date.UTC(y, m, d - 29))), to: today };
  if (p === 'this_year') return { from: ymd(new Date(Date.UTC(y, 0, 1))), to: today };
  return {}; // all time
}

interface AffiliateOpt2 { _id: string; username?: string; email?: string }

export default function PlayerLeaderboard({ endpoint, scope, affiliatesEndpoint }: { endpoint: string; scope: 'operator' | 'affiliate'; affiliatesEndpoint?: string }) {
  const [metric, setMetric] = useState<string>('ngrCents');
  const [period, setPeriod] = useState<string>('this_month');
  const [affFilter, setAffFilter] = useState<string>(''); // '' = all, '__none__' = organic, else affiliateId
  const range = rangeFor(period);

  // Operators can slice by affiliate (or organic / all). Affiliates don't.
  const { data: affData } = useBaseQuery<AffiliateOpt2[]>({
    endpoint: affiliatesEndpoint || '',
    queryKey: ['lb-affiliates', affiliatesEndpoint],
    enabled: scope === 'operator' && !!affiliatesEndpoint,
  });
  const affiliates = affData ?? [];

  const { data, isLoading } = useBaseQuery<{ players: PlayerRow[] }>({
    endpoint,
    queryKey: ['player-leaderboard', endpoint, metric, period, affFilter],
    params: {
      sortBy: metric, sortDir: 'desc', limit: 50, page: 1,
      ...(range.from ? { from: range.from } : {}),
      ...(range.to ? { to: range.to } : {}),
      ...(affFilter ? { affiliateId: affFilter } : {}),
    },
  });
  const players = data?.players ?? [];
  const affName = (a: PlayerRow['affiliateId']) =>
    a && typeof a === 'object' ? a.name || a.username || a.email || '—' : '—';

  return (
    <div className='bg-white/80 backdrop-blur-sm rounded-xl border border-violet-100 overflow-hidden'>
      <div className='px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap'>
        <p className='text-sm font-medium text-gray-800'>🏆 Top 50 players</p>
        <div className='flex items-center gap-2 flex-wrap'>
        {scope === 'operator' && affiliatesEndpoint && (
          <select value={affFilter} onChange={(e) => setAffFilter(e.target.value)}
            className='text-xs rounded-lg px-2 py-1.5 border border-gray-200 bg-white text-gray-700 focus:outline-none focus:border-primary max-w-[160px]'>
            <option value=''>All players</option>
            <option value='__none__'>Organic (no affiliate)</option>
            {affiliates.map((a) => <option key={a._id} value={a._id}>{a.username || a.email || a._id}</option>)}
          </select>
        )}
        <select value={period} onChange={(e) => setPeriod(e.target.value)}
          className='text-xs rounded-lg px-2 py-1.5 border border-gray-200 bg-white text-gray-700 focus:outline-none focus:border-primary'>
          {PERIODS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
        <div className='flex rounded-lg border border-gray-200 overflow-hidden text-xs'>
          {METRICS.map((m) => (
            <button key={m.key} onClick={() => setMetric(m.key)}
              className={`px-3 py-1.5 font-medium ${metric === m.key ? 'bg-primary text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              {m.label}
            </button>
          ))}
        </div>
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
                  <td className='px-4 py-2 max-w-[200px]'>
                    <div className='text-xs font-medium text-gray-800 truncate'>{p.username || p.playerId}</div>
                    {p.username && <div className='text-[10px] text-gray-400 truncate'>{p.playerId}</div>}
                  </td>
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
