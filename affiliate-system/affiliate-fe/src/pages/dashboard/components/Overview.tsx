import React, { useEffect, useMemo, useState } from 'react';
import BSelectWithSearch from '@components/core-components/selectWithInput/BSelectWithSearch';
import { useBaseQuery } from 'api/core/useBaseQuery';
import { DASHBOARD_API_URLS } from 'config/apiUrls';

import CasinoOverviewTable from './CasinoOverviewTable';

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

/** Inner payload from the endpoint */
export type CasinoOverviewType = {
  range: DashboardRangeType;
  currency: CurrencyType;
  live: { turnover: number; winnings: number; ggr: number; profitability_pct: number };
  rng: { turnover: number; winnings: number; ggr: number; profitability_pct: number };
  totals: { turnover: number; winnings: number; ggr: number; profitability_pct: number };
};

/** API envelope: your endpoint returns { success, data } */
type ApiEnvelope<T> = { success: boolean; data: T };

const RANGE_OPTIONS: { value: DashboardRangeType; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this_week', label: 'This Week' },
  { value: 'last_week', label: 'Last Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
];

/** Generic-mode columns to mirror old headers: TYPE | Live | RNG | Total */
const COLUMNS = [
  { key: 'type', header: 'TYPE' },
  { key: 'live', header: 'Live' },
  { key: 'rng', header: 'RNG' },
  { key: 'total', header: 'Total' },
];

/** Currency-aware formatting */
const formatValue = (value: number, isPercent: boolean, currency?: CurrencyType): string => {
  const dec = Number(currency?.fixedValueCount ?? 2);
  const num = Number(value ?? 0);
  if (isPercent) return `${num.toFixed(dec)}%`;
  const sym = (currency?.symbol ?? '').trim();
  return `${sym}${num.toLocaleString('en-GB', { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;
};

/** Transform API payload → rows for generic TableComponent */
const toRows = (payload: CasinoOverviewType) => {
  const c = payload.currency;

  return [
    {
      type: 'Turnover',
      rng: { value: formatValue(payload.rng.turnover, false, c), change: 'neutral' },
      live: { value: formatValue(payload.live.turnover, false, c), change: 'neutral' },
      total: { value: formatValue(payload.totals.turnover, false, c), change: 'neutral' },
      color: '#5FA7FF',
    },
    {
      type: 'Winning',
      rng: { value: formatValue(payload.rng.winnings, false, c), change: 'neutral' },
      live: { value: formatValue(payload.live.winnings, false, c), change: 'neutral' },
      total: { value: formatValue(payload.totals.winnings, false, c), change: 'neutral' },
      color: '#F46082',
    },
    {
      type: 'GGR',
      rng: { value: formatValue(payload.rng.ggr, false, c), change: 'neutral' },
      live: { value: formatValue(payload.live.ggr, false, c), change: 'neutral' },
      total: { value: formatValue(payload.totals.ggr, false, c), change: 'neutral' },
      color: '#70D49A',
    },
    {
      type: 'Profitability',
      rng: { value: formatValue(payload.rng.profitability_pct, true, c), change: 'neutral' },
      live: { value: formatValue(payload.live.profitability_pct, true, c), change: 'neutral' },
      total: { value: formatValue(payload.totals.profitability_pct, true, c), change: 'neutral' },
      color: '#FFCF45',
    },
  ];
};

const CasinoOverview: React.FC = () => {
  const [range, setRange] = useState<DashboardRangeType>('today');

  // Query envelope
  const {
    data: api,
    isLoading,
    error,
    refetch,
  } = useBaseQuery<ApiEnvelope<CasinoOverviewType>>({
    endpoint: DASHBOARD_API_URLS.GET_CASINO_OVERVIEW_DATA(range),
    // options: { keepPreviousData: true, refetchOnWindowFocus: false },
  });

  // Force refetch when range changes (covers base hooks that don’t re-run automatically on param changes)
  useEffect(() => {
    refetch?.();
  }, [range, refetch]);

  const payload = api?.data;

  // Build rows for the generic table
  const rows = useMemo(() => (payload ? toRows(payload) : []), [payload]);

  return (
    <div
      className="bg-white rounded-[10px] overflow-hidden h-full"
      style={{ boxShadow: '0px 2px 6px 0px rgba(0, 0, 0, 0.10)' }}
    >
      <div className="flex flex-col p-6">
        {/* Header + Range Selector */}
        <div className="flex flex-row justify-between items-center">
          <span className="text-base font-extrabold text-gray-900 pb-6">Casino Overview</span>

          <BSelectWithSearch
            label="Select Range"
            options={RANGE_OPTIONS}
            value={range}
            onChange={(val: string) => setRange(val as DashboardRangeType)}
            showSearch={false}
            classname="h-full w-[237px]"
          />
        </div>

        {/* States */}
        {isLoading && <div className="py-8 text-sm text-gray-500">Loading…</div>}
        {error && (
          <div className="py-8 text-sm text-red-600">
            Failed to load.{' '}
            <button className="underline" onClick={() => refetch?.()} type="button">
              Retry
            </button>
          </div>
        )}

        {/* Generic TableComponent usage:
            - leadingKey="type": renders the first column as your legacy "TYPE"
            - columns=COLUMNS: Live | RNG | Total */}
        {!isLoading && !error && <CasinoOverviewTable columns={COLUMNS} rows={rows} />}
      </div>
    </div>
  );
};

export default CasinoOverview;
