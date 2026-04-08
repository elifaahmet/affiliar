import React, { useState } from 'react';
import BSelectWithSearch from '@components/core-components/selectWithInput/BSelectWithSearch';
import { useBaseQuery } from 'api/core/useBaseQuery';
import { DASHBOARD_API_URLS } from 'config/apiUrls';

import TopProvidersTable from './TopProvidersTable';

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
export type Top5ProvidersType = {
  currency: CurrencyType;
  providers: Array<{
    rank: number;
    provider: string;
    total: number;
  }>;
};

/** API envelope: endpoint returns { success, data } */
type ApiEnvelope<T> = { success: boolean; data: T };

const Top5Providers: React.FC = () => {
  const [range, setRange] = useState<DashboardRangeType>('this_month');

  /**
   * Left table: Top profitable providers
   */
  const {
    data: profitableApi,
    isLoading: isLoadingProfitable,
    error: profitableError,
    refetch: refetchProfitable,
  } = useBaseQuery<ApiEnvelope<Top5ProvidersType>>({
    endpoint: DASHBOARD_API_URLS.GET_TOP_PROFITABLE_PROVIDERS(range),
    // options: { keepPreviousData: true, refetchOnWindowFocus: false },
  });

  /**
   * Right table: Top unprofitable providers
   * NOTE: Adjust endpoint if your API uses a different name.
   */
  const {
    data: unprofitableApi,
    isLoading: isLoadingUnprofitable,
    error: unprofitableError,
    refetch: refetchUnprofitable,
  } = useBaseQuery<ApiEnvelope<Top5ProvidersType>>({
    endpoint: DASHBOARD_API_URLS.GET_TOP_PROFITABLE_PROVIDERS(range, false),
    // options: { keepPreviousData: true, refetchOnWindowFocus: false },
  });

  /** Safely unwrap API envelopes */
  const profitablePayload = profitableApi?.data;
  const unprofitablePayload = unprofitableApi?.data;
  const profitableTotals = profitablePayload?.providers?.map((item) => Math.abs(item.total)) ?? [];
  const unprofitableTotals =
    unprofitablePayload?.providers?.map((item) => Math.abs(item.total)) ?? [];
  const maxAbsGGR = Math.max(...profitableTotals, ...unprofitableTotals, 0) || 1;

  return (
    <div
      className="h-full overflow-hidden rounded-[10px] bg-white"
      style={{ boxShadow: '0px 2px 6px 0px rgba(0, 0, 0, 0.10)' }}
    >
      <div className="flex h-full flex-col p-6">
        {/* Header row: title + shared range filter */}
        <div className="mb-4 flex flex-row items-center justify-between">
          <span className="pb-2 text-base font-extrabold text-gray-900">
            Most / Least Profitable Providers
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
          {/* Left: Profitable providers */}
          <div className="min-w-0 flex-1">
            {isLoadingProfitable && (
              <div className="py-8 text-sm text-gray-500">Loading profitable providers…</div>
            )}

            {profitableError && !isLoadingProfitable && (
              <div className="py-8 text-sm text-red-600">
                Failed to load profitable providers.{' '}
                <button className="underline" onClick={() => refetchProfitable?.()} type="button">
                  Retry
                </button>
              </div>
            )}

            {!isLoadingProfitable && !profitableError && (
              <TopProvidersTable
                data={profitablePayload}
                label="Most Profitable"
                profit={true}
                maxAbsGGR={maxAbsGGR}
              />
            )}
          </div>

          {/* Right: Unprofitable providers */}
          <div className="min-w-0 flex-1">
            {isLoadingUnprofitable && (
              <div className="py-8 text-sm text-gray-500">Loading unprofitable providers…</div>
            )}

            {unprofitableError && !isLoadingUnprofitable && (
              <div className="py-8 text-sm text-red-600">
                Failed to load unprofitable providers.{' '}
                <button className="underline" onClick={() => refetchUnprofitable?.()} type="button">
                  Retry
                </button>
              </div>
            )}

            {!isLoadingUnprofitable && !unprofitableError && (
              <TopProvidersTable
                data={unprofitablePayload}
                label="Least Profitable"
                profit={false}
                maxAbsGGR={maxAbsGGR}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Top5Providers;
