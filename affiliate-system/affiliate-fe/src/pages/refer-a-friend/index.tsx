import { useMemo, useState } from 'react';
import { useBaseQuery } from 'api/core/useBaseQuery';
import { useQueryClient } from '@tanstack/react-query';
import { BRANDS_API_URLS, REFER_API_URLS } from 'config/apiUrls';

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

  return (
    <div className='h-full overflow-auto p-6 pb-24 space-y-6'>
      <header className='space-y-1'>
        <h1 className='text-2xl font-semibold tracking-tight text-gray-900'>
          Refer-a-Friend
        </h1>
        <p className='text-sm text-gray-700 max-w-2xl'>
          Player-to-player referral engine. Configure rewards and qualification gates per brand;
          Affiliar fires a signed webhook to your wallet system when a friend qualifies.
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
