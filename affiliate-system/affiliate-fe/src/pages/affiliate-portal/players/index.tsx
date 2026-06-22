import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useBaseQuery } from 'api/core/useBaseQuery';
import axiosInstance from 'config/axiosInstance';
import { AFFILIATE_PORTAL_API_URLS } from 'config/apiUrls';

interface ProfileResponse {
  referralCodes: { code: string; brandId: string | null; brandName: string | null }[];
}

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
  externalRef: string | null;
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

// "Your reference": shows the affiliate's own id for this player — the sub
// carried on the link, overridable inline (stored as externalRef). Lets them
// reconcile with their platform without us exposing operator ids.
function RefCell({ player }: { player: PlayerRow }) {
  const queryClient = useQueryClient();
  const current = player.externalRef ?? player.subId ?? '';
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(current);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await axiosInstance.patch(AFFILIATE_PORTAL_API_URLS.PLAYER_REF(player.playerId), {
        ref: value.trim() || null,
      });
      queryClient.invalidateQueries({ queryKey: ['affiliate-players'] });
      setEditing(false);
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Could not save reference.');
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className='flex items-center gap-1'>
        <input
          value={value}
          autoFocus
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
          className='w-28 text-xs rounded border border-gray-200 px-2 py-1 focus:outline-none focus:border-primary font-mono'
        />
        <button onClick={save} disabled={saving} className='text-[11px] font-medium text-primary hover:underline disabled:opacity-50'>
          {saving ? '…' : 'Save'}
        </button>
        <button onClick={() => { setValue(current); setEditing(false); }} className='text-[11px] text-gray-400 hover:text-gray-600'>✕</button>
      </div>
    );
  }
  return (
    <button
      onClick={() => setEditing(true)}
      title='Click to set your own reference for this player'
      className='group inline-flex items-center gap-1 text-xs font-mono text-gray-700 hover:text-primary'
    >
      <span className={current ? '' : 'text-gray-400'}>{current || '+ set'}</span>
      <span className='opacity-0 group-hover:opacity-100 text-[10px] text-gray-400'>✎</span>
    </button>
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
  const [searchPlayerId,  setSearchPlayerId]  = useState('');
  const [filterCode,      setFilterCode]      = useState('');
  const [filterCampaign,  setFilterCampaign]  = useState('');
  const [filterFrom,      setFilterFrom]      = useState('');
  const [filterTo,        setFilterTo]        = useState('');
  const limit = 50;

  const { data: profile } = useBaseQuery<ProfileResponse>({
    endpoint: AFFILIATE_PORTAL_API_URLS.PROFILE(),
    queryKey: ['affiliate-profile'],
  });
  const referralCodes = profile?.referralCodes ?? [];

  const params = useMemo(() => {
    const p: Record<string, string | number> = { page, limit };
    if (searchPlayerId) p.playerId      = searchPlayerId;
    if (filterCode)     p.affiliateCode = filterCode;
    if (filterCampaign) p.campaign      = filterCampaign;
    if (filterFrom)     p.from          = filterFrom;
    if (filterTo)       p.to            = filterTo;
    return p;
  }, [page, searchPlayerId, filterCode, filterCampaign, filterFrom, filterTo]);

  const { data, isLoading, isError } = useBaseQuery<PlayersResponse>({
    endpoint: AFFILIATE_PORTAL_API_URLS.PLAYERS(),
    queryKey: ['affiliate-players', params],
    params,
  });

  const players = data?.players ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / limit));

  const hasActiveFilter = Boolean(
    searchPlayerId || filterCode || filterCampaign || filterFrom || filterTo,
  );

  // Any filter change resets pagination back to page 1.
  function withReset<T>(setter: (v: T) => void) {
    return (v: T) => { setPage(1); setter(v); };
  }

  return (
    <div className='h-full overflow-auto p-6 pb-24 space-y-6'>
      {/* Filters */}
      <div className='bg-white/80 backdrop-blur-sm rounded-xl border border-violet-100 p-4 space-y-3'>
        <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3'>
          <label className='flex flex-col gap-1'>
            <span className='text-[10px] font-medium uppercase tracking-[0.1em] text-gray-600'>Player ID</span>
            <input
              type='text'
              value={searchPlayerId}
              onChange={(e) => withReset(setSearchPlayerId)(e.target.value)}
              placeholder='Search…'
              className='bg-white text-gray-700 text-xs rounded-lg px-2 py-1.5 border border-gray-200 focus:outline-none focus:border-primary shadow-sm'
            />
          </label>
          <label className='flex flex-col gap-1'>
            <span className='text-[10px] font-medium uppercase tracking-[0.1em] text-gray-600'>Referral code</span>
            <select
              value={filterCode}
              onChange={(e) => withReset(setFilterCode)(e.target.value)}
              className='bg-white text-gray-700 text-xs rounded-lg px-2 py-1.5 border border-gray-200 focus:outline-none focus:border-primary shadow-sm'
            >
              <option value=''>All codes</option>
              {referralCodes.map((rc) => (
                <option key={rc.code} value={rc.code}>
                  {rc.code}{rc.brandName ? ` · ${rc.brandName}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className='flex flex-col gap-1'>
            <span className='text-[10px] font-medium uppercase tracking-[0.1em] text-gray-600'>Campaign</span>
            <input
              type='text'
              value={filterCampaign}
              onChange={(e) => withReset(setFilterCampaign)(e.target.value)}
              placeholder='e.g. summer_promo'
              className='bg-white text-gray-700 text-xs rounded-lg px-2 py-1.5 border border-gray-200 focus:outline-none focus:border-primary shadow-sm'
            />
          </label>
          <label className='flex flex-col gap-1'>
            <span className='text-[10px] font-medium uppercase tracking-[0.1em] text-gray-600'>Registered from</span>
            <input
              type='date'
              value={filterFrom}
              onChange={(e) => withReset(setFilterFrom)(e.target.value)}
              className='bg-white text-gray-700 text-xs rounded-lg px-2 py-1.5 border border-gray-200 focus:outline-none focus:border-primary shadow-sm'
            />
          </label>
          <label className='flex flex-col gap-1'>
            <span className='text-[10px] font-medium uppercase tracking-[0.1em] text-gray-600'>Registered to</span>
            <input
              type='date'
              value={filterTo}
              onChange={(e) => withReset(setFilterTo)(e.target.value)}
              className='bg-white text-gray-700 text-xs rounded-lg px-2 py-1.5 border border-gray-200 focus:outline-none focus:border-primary shadow-sm'
            />
          </label>
        </div>
        {hasActiveFilter && (
          <button
            type='button'
            onClick={() => {
              setPage(1);
              setSearchPlayerId('');
              setFilterCode('');
              setFilterCampaign('');
              setFilterFrom('');
              setFilterTo('');
            }}
            className='text-xs font-medium text-primary hover:text-primary-dark'
          >
            Clear filters
          </button>
        )}
      </div>

      <div className='bg-white/80 backdrop-blur-sm rounded-xl border border-violet-100 overflow-hidden'>
        <div className='px-5 py-3 border-b border-gray-100 flex items-center justify-between'>
          <p className='text-sm font-semibold text-gray-800'>My Players</p>
          <p className='text-xs text-gray-600'>{total} total</p>
        </div>

        {isLoading && (
          <div className='p-8 text-center'>
            <p className='text-sm text-gray-600'>Loading...</p>
          </div>
        )}

        {isError && (
          <div className='p-8 text-center'>
            <p className='text-sm text-red-500'>Failed to load players.</p>
          </div>
        )}

        {!isLoading && !isError && players.length === 0 && (
          <div className='p-8 text-center'>
            <p className='text-sm text-gray-600'>
              No players yet. Players who register with your referral code will appear here.
            </p>
          </div>
        )}

        {!isLoading && !isError && players.length > 0 && (
          <div className='overflow-x-auto'>
            <table className='w-full'>
              <thead className='bg-gray-50'>
                <tr>
                  <th className='px-4 py-3 text-left text-xs font-semibold text-gray-700'>Player ID</th>
                  <th className='px-4 py-3 text-left text-xs font-semibold text-gray-700'>Your reference</th>
                  <th className='px-4 py-3 text-left text-xs font-semibold text-gray-700'>Status</th>
                  <th className='px-4 py-3 text-left text-xs font-semibold text-gray-700'>Code</th>
                  <th className='px-4 py-3 text-left text-xs font-semibold text-gray-700'>Campaign</th>
                  <th className='px-4 py-3 text-left text-xs font-semibold text-gray-700'>Country</th>
                  <th className='px-4 py-3 text-left text-xs font-semibold text-gray-700'>Currency</th>
                  <th className='px-4 py-3 text-left text-xs font-semibold text-gray-700'>Registered</th>
                  <th className='px-4 py-3 text-right text-xs font-semibold text-gray-700'>Deposits</th>
                  <th className='px-4 py-3 text-right text-xs font-semibold text-gray-700'>FTD</th>
                  <th className='px-4 py-3 text-right text-xs font-semibold text-gray-700'>NGR</th>
                  <th className='px-4 py-3 text-left text-xs font-semibold text-gray-700'>Last Activity</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-gray-100'>
                {players.map((p, i) => (
                  <tr key={p._id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className='px-4 py-3 text-xs font-mono text-gray-700 whitespace-nowrap'>
                      {p.playerId}
                    </td>
                    <td className='px-4 py-3 whitespace-nowrap'>
                      <RefCell player={p} />
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
            <p className='text-xs text-gray-700'>
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
