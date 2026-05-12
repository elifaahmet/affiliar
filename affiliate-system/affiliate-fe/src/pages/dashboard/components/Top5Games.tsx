import React, { useState } from 'react';
import BSelectWithSearch from '@components/core-components/selectWithInput/BSelectWithSearch';
import { useBaseQuery } from 'api/core/useBaseQuery';
import { DASHBOARD_API_URLS } from 'config/apiUrls';

import TopGamesTable from './TopGamesTable';

/** BE range enum */
export type DashboardRangeType =
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'last_week'
  | 'this_month'
  | 'last_month';

export type CurrencyType = {
  name: string;
  code: string;
  symbol: string;
  fixedValueCount: number;
};

/** UI options for the range select */
const RANGE_OPTIONS: { value: DashboardRangeType; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this_week', label: 'This Week' },
  { value: 'last_week', label: 'Last Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
];

/** Inner payload from the endpoint */
export type Top5GamesType = {
  currency: CurrencyType;
  games: Array<{
    rank: number;
    game: {
      game_name: string;
      game_code: string;
      provider: string;
      url_thumb: string;
    };
    total: number;
  }>;
};

/** API envelope: endpoint returns { success, data } */
type ApiEnvelope<T> = { success: boolean; data: T };

const Top5Games: React.FC = () => {
  const [range, setRange] = useState<DashboardRangeType>('this_month');

  /**
   * Left table: Top profitable games
   */
  const {
    data: profitableApi,
    isLoading: isLoadingProfitable,
    error: profitableError,
    refetch: refetchProfitable,
  } = useBaseQuery<ApiEnvelope<Top5GamesType>>({
    endpoint: DASHBOARD_API_URLS.GET_TOP_PROFITABLE_GAMES(range),
    // options: { keepPreviousData: true, refetchOnWindowFocus: false },
  });

  /**
   * Right table: Top unprofitable games
   * NOTE: Adjust endpoint if your API uses a different name.
   */
  const {
    data: unprofitableApi,
    isLoading: isLoadingUnprofitable,
    error: unprofitableError,
    refetch: refetchUnprofitable,
  } = useBaseQuery<ApiEnvelope<Top5GamesType>>({
    endpoint: DASHBOARD_API_URLS.GET_TOP_PROFITABLE_GAMES(range, false),
    // options: { keepPreviousData: true, refetchOnWindowFocus: false },
  });

  /** Safely unwrap API envelopes */
  const profitablePayload = profitableApi?.data;
  const unprofitablePayload = unprofitableApi?.data;

  return (
    <div
      className="h-full overflow-hidden rounded-[10px] bg-white"
      style={{ boxShadow: '0px 2px 6px 0px rgba(0, 0, 0, 0.10)' }}
    >
      <div className="flex h-full flex-col p-6">
        {/* Header row: title + shared range filter */}
        <div className="mb-4 flex flex-row items-center justify-between">
          <span className="pb-2 text-base font-extrabold text-gray-900">
            Most / Least Profitable Games
          </span>

          <BSelectWithSearch
            label="Select Range"
            options={RANGE_OPTIONS}
            value={range}
            onChange={(val: string) => setRange(val as DashboardRangeType)}
            showSearch={false}
            classname="h-full w-[237px]"
          />
        </div>

        {/* Content row: two equal-width tables side by side */}
        <div className="flex flex-1 flex-row gap-6 min-h-0">
          {/* Left: Profitable table */}
          <div className="flex-1 min-w-0">
            {isLoadingProfitable && (
              <div className="py-8 text-sm text-gray-700">Loading profitable games…</div>
            )}

            {profitableError && !isLoadingProfitable && (
              <div className="py-8 text-sm text-red-600">
                Failed to load profitable games.{' '}
                <button className="underline" onClick={() => refetchProfitable?.()} type="button">
                  Retry
                </button>
              </div>
            )}

            {!isLoadingProfitable && !profitableError && (
              <TopGamesTable data={profitablePayload} label="Most Profitable" profit={true} />
            )}
          </div>

          {/* Right: Unprofitable table */}
          <div className="flex-1 min-w-0">
            {isLoadingUnprofitable && (
              <div className="py-8 text-sm text-gray-700">Loading unprofitable games…</div>
            )}

            {unprofitableError && !isLoadingUnprofitable && (
              <div className="py-8 text-sm text-red-600">
                Failed to load unprofitable games.{' '}
                <button className="underline" onClick={() => refetchUnprofitable?.()} type="button">
                  Retry
                </button>
              </div>
            )}

            {!isLoadingUnprofitable && !unprofitableError && (
              <TopGamesTable data={unprofitablePayload} label="Least Profitable" profit={false} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Top5Games;
