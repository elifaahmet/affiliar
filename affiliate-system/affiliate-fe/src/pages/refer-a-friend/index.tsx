import { useMemo, useState } from 'react';
import { useBaseQuery } from 'api/core/useBaseQuery';
import { useQueryClient } from '@tanstack/react-query';
import axiosInstance from 'config/axiosInstance';
import { BRANDS_API_URLS, REFER_API_URLS, AFFILIATE_PLAYERS_API_URLS } from 'config/apiUrls';

import ConfigurationTab from './components/ConfigurationTab';
import ActivityTab from './components/ActivityTab';
import CrewAdminTab from './components/CrewAdminTab';
import type { Brand, BrandsResponse, ConfigsResponse } from './types';

type TabKey = 'configuration' | 'activity' | 'crew-admin';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'configuration', label: 'Configuration' },
  { key: 'activity',      label: 'Activity' },
  { key: 'crew-admin',    label: 'Crew admin' },
];

export default function ReferAFriendPage() {
  const [tab, setTab] = useState<TabKey>('configuration');

  const queryClient = useQueryClient();

  const { data: brandsData, isLoading: brandsLoading } = useBaseQuery<BrandsResponse>({
    endpoint: BRANDS_API_URLS.LIST(),
    queryKey: ['refer-brands'],
  });

  const { data: configsData, isLoading: configsLoading } = useBaseQuery<ConfigsResponse>({
    endpoint: REFER_API_URLS.CONFIGS(),
    queryKey: ['refer-configs'],
  });

  const brands: Brand[] = useMemo(
    () => (Array.isArray(brandsData) ? brandsData : brandsData?.brands ?? []),
    [brandsData],
  );

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['refer-configs'] });
  };

  // Referrers and referees are listed by player id until the casino tells us
  // their usernames. Same pull as the Players page — offered here too because
  // this is where you actually read those tables.
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const syncNames = async () => {
    setSyncing(true); setSyncMsg('');
    try {
      const { data } = await axiosInstance.post(AFFILIATE_PLAYERS_API_URLS.SYNC_NAMES(), {});
      setSyncMsg(`Synced ${data.synced}/${data.total} usernames`);
      // The names live in a separate cache from the referral rows, so the
      // tables need re-fetching before the sync shows up in them.
      for (const key of [
        'refer-referrals',
        'refer-referrals-by-player',
        'refer-top-referrers',
        'refer-deliveries',
        'refer-fraud-flagged',
      ]) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } } };
      setSyncMsg(err.response?.data?.error || 'Sync failed');
    } finally { setSyncing(false); setTimeout(() => setSyncMsg(''), 6000); }
  };

  return (
    <div className='h-full overflow-auto p-6 pb-24 space-y-6'>
      <header className='flex items-start justify-between gap-3 flex-wrap'>
        <div className='space-y-1'>
          <h1 className='text-2xl font-semibold tracking-tight text-gray-900'>
            Refer-a-Friend
          </h1>
          <p className='text-sm text-gray-700 max-w-2xl'>
            Player-to-player referral engine. Configure rewards and qualification gates per brand;
            Affiliar fires a signed webhook to your wallet system when a friend qualifies.
          </p>
        </div>
        <div className='flex items-center gap-2 shrink-0'>
          {syncMsg && <span className='text-xs text-gray-600'>{syncMsg}</span>}
          <button onClick={syncNames} disabled={syncing}
            title='Pull player usernames from the casino so referrers and referees show names instead of ids'
            className='text-sm font-medium text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-lg px-4 py-2 disabled:opacity-50'>
            {syncing ? 'Syncing…' : '↻ Sync usernames'}
          </button>
        </div>
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

      {tab === 'configuration' && (
        <ConfigurationTab
          brands={brands}
          configs={configsData?.configs ?? []}
          loading={brandsLoading || configsLoading}
          onChange={refresh}
        />
      )}

      {tab === 'activity' && <ActivityTab brands={brands} />}

      {tab === 'crew-admin' && <CrewAdminTab brands={brands} />}
    </div>
  );
}
