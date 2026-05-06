import { useEffect, useMemo, useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useBaseQuery } from 'api/core/useBaseQuery';
import { BRANDS_API_URLS, REPORTS_API_URLS } from 'config/apiUrls';
import BSelectWithSearch from '@components/core-components/selectWithInput/BSelectWithSearch';

interface Brand { id: number; name: string; _id: string; }
interface BrandsResponse { brands: Brand[]; }

// ── helpers ───────────────────────────────────────────────────────────────────

function fmt(cents: number) {
  return (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ── period presets ────────────────────────────────────────────────────────────

type PeriodKey =
  | 'yesterday' | 'today'
  | 'week'      | 'last_week'
  | 'month'     | 'last_month'
  | 'year'      | 'last_year';

interface Period { from: string; to: string }

function buildPeriod(key: PeriodKey | 'week' | 'month' | 'year'): Period {
  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const monday = (d: Date) => {
    const day = d.getDay() || 7;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() - day + 1);
  };

  switch (key) {
    case 'yesterday': {
      const y = new Date(today); y.setDate(y.getDate() - 1);
      return { from: ymd(y), to: ymd(y) };
    }
    case 'today':
      return { from: ymd(today), to: ymd(today) };
    case 'week': {
      const mon = monday(today);
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
      return { from: ymd(mon), to: ymd(sun) };
    }
    case 'last_week': {
      const lm = monday(today); lm.setDate(lm.getDate() - 7);
      const le = new Date(lm); le.setDate(le.getDate() + 6);
      return { from: ymd(lm), to: ymd(le) };
    }
    case 'month': {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      const last  = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return { from: ymd(first), to: ymd(last) };
    }
    case 'last_month': {
      const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const last  = new Date(today.getFullYear(), today.getMonth(), 0);
      return { from: ymd(first), to: ymd(last) };
    }
    case 'year': {
      const first = new Date(today.getFullYear(), 0, 1);
      const last  = new Date(today.getFullYear(), 11, 31);
      return { from: ymd(first), to: ymd(last) };
    }
    case 'last_year': {
      const first = new Date(today.getFullYear() - 1, 0, 1);
      const last  = new Date(today.getFullYear() - 1, 11, 31);
      return { from: ymd(first), to: ymd(last) };
    }
  }
}

const PERIOD_BUTTONS: { key: PeriodKey; label: string }[] = [
  { key: 'yesterday',  label: 'Yesterday'  },
  { key: 'today',      label: 'Today'      },
  { key: 'week',       label: 'This Week'  },
  { key: 'last_week',  label: 'Last Week'  },
  { key: 'month',      label: 'This Month' },
  { key: 'last_month', label: 'Last Month' },
  { key: 'year',       label: 'This Year'  },
  { key: 'last_year',  label: 'Last Year'  },
];

// ── types ─────────────────────────────────────────────────────────────────────

interface DayRow {
  date: string;
  registrations: number;
  ftdCount: number;
  ftdSumCents: number;
  depositsCount: number;
  depositsSumCents: number;
  cashoutsCount: number;
  cashoutsSumCents: number;
  chargebacksCount: number;
  chargebacksSumCents: number;
  betsSumCents: number;
  winsSumCents: number;
  casinoBetsRollbacksSumCents: number;
  casinoWinsRollbacksSumCents: number;
  bonusIssuesSumCents: number;
  additionalDeductionsSumCents: number;
  paymentSystemFeesSumCents: number;
  jackpotFeesSumCents: number;
  gameProviderFeesSumCents: number;
  casinoTaxesSumCents: number;
  computedGgrCents: number;
  computedNgrCents: number;
  roundsCount: number;
  wagerCents: number;
  playerCount: number;
  // Sportsbook metrics
  sbBetsSumCents: number;
  sbWinsSumCents: number;
  sbCancelledBetsSumCents: number;
  sbRejectedBetsSumCents: number;
  sbWinRollbacksSumCents: number;
  sbSettledBetsSumCents: number;
  sbBonusIssuesSumCents: number;
  sbBalanceCorrectionsSumCents: number;
  sbThirdPartyFeesSumCents: number;
  sbGgrCents: number;
  sbNgrCents: number;
  combinedNgrCents: number;
}

type ProductScope = 'all' | 'casino' | 'sportsbook';

type MetricSummary = Omit<DayRow, 'date'>;

interface OverviewResponse {
  period: Period;
  summary: MetricSummary;
  byDay: DayRow[];
}

// ── chart metrics catalogue ───────────────────────────────────────────────────

interface ChartMetricDef {
  key: string;
  label: string;
  // 'shared' = always shown, 'casino' / 'sportsbook' = only shown in that tab
  scope: 'shared' | 'casino' | 'sportsbook';
  isCents?: boolean;
  isRate?: boolean;
  computed?: (row: DayRow) => number;
}

const CHART_METRICS: ChartMetricDef[] = [
  { key: 'registrations',              label: 'Registrations',    scope: 'shared' },
  { key: 'playerCount',                label: 'Players',          scope: 'shared' },
  { key: 'ftdCount',                   label: 'FTD Count',        scope: 'shared' },
  { key: 'ftdSumCents',                label: 'FTD Sum',          scope: 'shared', isCents: true },
  { key: 'ftdConversionRate',          label: 'FTD Conversion %', scope: 'shared', isRate: true,
    computed: (r) => r.registrations > 0 ? (r.ftdCount / r.registrations) * 100 : 0 },
  { key: 'depositsCount',              label: 'Deposits Count',   scope: 'shared' },
  { key: 'depositsSumCents',           label: 'Deposits Sum',     scope: 'shared', isCents: true },
  { key: 'avgDepositCents',            label: 'Avg Deposit',      scope: 'shared', isCents: true,
    computed: (r) => r.depositsCount > 0 ? r.depositsSumCents / r.depositsCount : 0 },
  { key: 'cashoutsCount',              label: 'Cashouts Count',   scope: 'shared' },
  { key: 'cashoutsSumCents',           label: 'Cashouts Sum',     scope: 'shared', isCents: true },
  { key: 'chargebacksCount',           label: 'Chargebacks Count',scope: 'shared' },
  { key: 'chargebacksSumCents',        label: 'Chargebacks Sum',  scope: 'shared', isCents: true },
  { key: 'combinedNgrCents',           label: 'Combined NGR',     scope: 'shared', isCents: true },
  // Casino
  { key: 'roundsCount',                label: 'Rounds',           scope: 'casino' },
  { key: 'wagerCents',                 label: 'Casino Wager',     scope: 'casino', isCents: true },
  { key: 'betsSumCents',               label: 'Casino Bets Sum',  scope: 'casino', isCents: true },
  { key: 'winsSumCents',               label: 'Casino Wins Sum',  scope: 'casino', isCents: true },
  { key: 'computedGgrCents',           label: 'Casino GGR',       scope: 'casino', isCents: true },
  { key: 'computedNgrCents',           label: 'Casino NGR',       scope: 'casino', isCents: true },
  { key: 'bonusIssuesSumCents',        label: 'Casino Bonuses',   scope: 'casino', isCents: true },
  { key: 'paymentSystemFeesSumCents',  label: 'PSP Fees',         scope: 'casino', isCents: true },
  { key: 'gameProviderFeesSumCents',   label: 'Game Provider Fees', scope: 'casino', isCents: true },
  { key: 'jackpotFeesSumCents',        label: 'Jackpot Fees',     scope: 'casino', isCents: true },
  { key: 'casinoTaxesSumCents',        label: 'Casino Taxes',     scope: 'casino', isCents: true },
  { key: 'additionalDeductionsSumCents', label: 'Balance Corrections', scope: 'casino', isCents: true },
  // Sportsbook
  { key: 'sbBetsSumCents',               label: 'SB Bets Sum',       scope: 'sportsbook', isCents: true },
  { key: 'sbWinsSumCents',               label: 'SB Wins Sum',       scope: 'sportsbook', isCents: true },
  { key: 'sbCancelledBetsSumCents',      label: 'SB Cancelled Bets', scope: 'sportsbook', isCents: true },
  { key: 'sbRejectedBetsSumCents',       label: 'SB Rejected Bets',  scope: 'sportsbook', isCents: true },
  { key: 'sbSettledBetsSumCents',        label: 'SB Settled Bets',   scope: 'sportsbook', isCents: true },
  { key: 'sbGgrCents',                   label: 'SB GGR',            scope: 'sportsbook', isCents: true },
  { key: 'sbNgrCents',                   label: 'SB NGR',            scope: 'sportsbook', isCents: true },
  { key: 'sbBonusIssuesSumCents',        label: 'SB Bonuses',        scope: 'sportsbook', isCents: true },
  { key: 'sbThirdPartyFeesSumCents',     label: 'SB 3rd-party Fees', scope: 'sportsbook', isCents: true },
];

// ── aggregate byDay rows into monthly buckets ─────────────────────────────────

const SUMMED_KEYS: (keyof Omit<DayRow, 'date'>)[] = [
  'registrations','ftdCount','ftdSumCents','depositsCount','depositsSumCents',
  'cashoutsCount','cashoutsSumCents','chargebacksCount','chargebacksSumCents',
  'betsSumCents','winsSumCents','casinoBetsRollbacksSumCents','casinoWinsRollbacksSumCents',
  'bonusIssuesSumCents','additionalDeductionsSumCents','paymentSystemFeesSumCents',
  'jackpotFeesSumCents','gameProviderFeesSumCents','casinoTaxesSumCents',
  'computedGgrCents','computedNgrCents','roundsCount','wagerCents','playerCount',
  'sbBetsSumCents','sbWinsSumCents','sbCancelledBetsSumCents','sbRejectedBetsSumCents',
  'sbWinRollbacksSumCents','sbSettledBetsSumCents','sbBonusIssuesSumCents',
  'sbBalanceCorrectionsSumCents','sbThirdPartyFeesSumCents',
  'sbGgrCents','sbNgrCents','combinedNgrCents',
];

function aggregateByMonth(rows: DayRow[]): DayRow[] {
  const map = new Map<string, DayRow>();
  for (const row of rows) {
    const month = row.date.slice(0, 7);
    if (!map.has(month)) {
      const zero = Object.fromEntries(SUMMED_KEYS.map(k => [k, 0])) as Omit<DayRow,'date'>;
      map.set(month, { date: month, ...zero });
    }
    const entry = map.get(month)!;
    for (const k of SUMMED_KEYS) {
      (entry[k] as number) += row[k] as number;
    }
  }
  return Array.from(map.values());
}

// ── QuickCharts ───────────────────────────────────────────────────────────────

type ChartWindow = 'week' | 'month' | 'year';

const CHART_WINDOWS: { key: ChartWindow; label: string }[] = [
  { key: 'week',  label: 'Week'  },
  { key: 'month', label: 'Month' },
  { key: 'year',  label: 'Year'  },
];

function QuickCharts({
  brandsData, product,
}: {
  brandsData: BrandsResponse | undefined;
  product: ProductScope;
}) {
  const [metricKey, setMetricKey]       = useState('registrations');
  const [chartBrandId, setChartBrandId] = useState('');
  const [window, setWindow]             = useState<ChartWindow>('month');
  const [custom, setCustom]             = useState<Period | null>(null);

  // Only metrics matching the selected product (plus shared) are offered.
  const visibleMetrics = useMemo(
    () =>
      CHART_METRICS.filter(
        (m) => m.scope === 'shared' || product === 'all' || m.scope === product,
      ),
    [product],
  );

  // If the current selection isn't valid for the new product, fall back.
  useEffect(() => {
    if (!visibleMetrics.find((m) => m.key === metricKey)) {
      setMetricKey(visibleMetrics[0]?.key ?? 'registrations');
    }
  }, [visibleMetrics, metricKey]);

  const period = useMemo(
    () => custom ?? buildPeriod(window),
    [custom, window],
  );

  const params = useMemo(
    () => ({ from: period.from, to: period.to, ...(chartBrandId ? { brandId: chartBrandId } : {}) }),
    [period, chartBrandId],
  );

  const { data, isLoading } = useBaseQuery<OverviewResponse>({
    endpoint: REPORTS_API_URLS.OVERVIEW(),
    queryKey: ['quick-chart', params],
    params,
  });

  const metricDef = CHART_METRICS.find(m => m.key === metricKey) ?? CHART_METRICS[0];

  const chartData = useMemo(() => {
    const rows = data?.byDay ?? [];
    return (window === 'year' && !custom) ? aggregateByMonth(rows) : rows;
  }, [data, window, custom]);

  const getValue = (row: DayRow): number => {
    if (metricDef.computed) return metricDef.computed(row);
    const raw = (row as any)[metricDef.key] ?? 0;
    return metricDef.isCents ? raw / 100 : raw;
  };

  const formatTick = (v: number) => {
    if (metricDef.isRate) return `${v.toFixed(1)}%`;
    if (metricDef.isCents) return `€${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0)}`;
    return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v);
  };

  const formatTooltip = (v: number) => {
    if (metricDef.isRate) return `${v.toFixed(2)}%`;
    if (metricDef.isCents) return `€${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return v.toLocaleString();
  };

  const points = chartData.map(row => ({ date: row.date, value: getValue(row) }));

  return (
    <div className='bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-4'>
      <h2 className='text-sm font-semibold text-gray-800'>Quick Charts</h2>

      {/* Filters row */}
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div className='flex flex-wrap items-center gap-2'>
          {/* Metric selector */}
          <div className='w-52'>
            <BSelectWithSearch
              value={metricKey}
              onChange={setMetricKey}
              options={visibleMetrics.map(m => ({ label: m.label, value: m.key }))}
              placeholder='Select metric'
            />
          </div>

          {/* Brand filter */}
          <div className='w-44'>
            <BSelectWithSearch
              value={chartBrandId}
              onChange={setChartBrandId}
              options={(brandsData?.brands ?? []).map(b => ({ label: b.name, value: b._id }))}
              placeholder='All Brands'
            />
          </div>

          {/* Custom period */}
          <div className='flex items-center gap-1'>
            <input
              type='date'
              value={custom?.from ?? period.from}
              onChange={(e) => setCustom(c => ({ from: e.target.value, to: c?.to ?? period.to }))}
              className='bg-white text-gray-700 text-xs rounded-lg px-2 py-1.5 border border-gray-200 focus:outline-none focus:border-primary shadow-sm'
            />
            <span className='text-gray-400 text-xs'>→</span>
            <input
              type='date'
              value={custom?.to ?? period.to}
              onChange={(e) => setCustom(c => ({ from: c?.from ?? period.from, to: e.target.value }))}
              className='bg-white text-gray-700 text-xs rounded-lg px-2 py-1.5 border border-gray-200 focus:outline-none focus:border-primary shadow-sm'
            />
          </div>
        </div>

        {/* Week / Month / Year toggle */}
        <div className='flex gap-1 bg-gray-100 p-1 rounded-lg'>
          {CHART_WINDOWS.map(w => (
            <button
              key={w.key}
              onClick={() => { setWindow(w.key); setCustom(null); }}
              className={`px-4 py-1 rounded-md text-sm font-medium transition-colors ${
                window === w.key && !custom
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className='pt-4'>
        {isLoading && (
          <div className='h-52 flex items-center justify-center'>
            <p className='text-sm text-gray-400'>Loading...</p>
          </div>
        )}

        {!isLoading && points.length === 0 && (
          <div className='h-52 flex items-center justify-center'>
            <p className='text-sm text-gray-400'>No data to display.</p>
          </div>
        )}

        {!isLoading && points.length > 0 && (
          <ResponsiveContainer width='100%' height={220}>
            <AreaChart data={points} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id='chartGrad' x1='0' y1='0' x2='0' y2='1'>
                  <stop offset='5%'  stopColor='#8B5CF6' stopOpacity={0.18} />
                  <stop offset='95%' stopColor='#8B5CF6' stopOpacity={0}    />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray='3 3' stroke='#f1f5f9' />
              <XAxis
                dataKey='date'
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                tickLine={false}
                axisLine={false}
                interval='preserveStartEnd'
              />
              <YAxis
                tickFormatter={formatTick}
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                tickLine={false}
                axisLine={false}
                width={60}
              />
              <Tooltip
                formatter={(v: number | undefined) => [formatTooltip(v ?? 0), metricDef.label]}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                labelStyle={{ color: '#475569', fontWeight: 600 }}
              />
              <Area
                type='monotone'
                dataKey='value'
                stroke='#8B5CF6'
                strokeWidth={2}
                fill='url(#chartGrad)'
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

// ── KPI card ──────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, accent }: {
  label: string; value: string; sub?: string; accent?: boolean;
}) {
  return (
    <div
      className={`rounded-xl p-5 border transition-shadow ${
        accent
          ? 'bg-gradient-to-br from-primary to-primary-dark border-primary/30 shadow-lg shadow-primary/20'
          : 'bg-white/80 backdrop-blur-sm border-violet-100 hover:shadow-sm'
      }`}
    >
      <p className={`text-[11px] font-medium uppercase tracking-[0.12em] mb-2 ${accent ? 'text-violet-100' : 'text-gray-400'}`}>
        {label}
      </p>
      <p className={`text-2xl font-semibold tracking-tight ${accent ? 'text-white' : 'text-gray-900'}`}>
        {value}
      </p>
      {sub && (
        <p className={`text-xs mt-1.5 ${accent ? 'text-violet-100/80' : 'text-gray-500'}`}>
          {sub}
        </p>
      )}
    </div>
  );
}

// ── table helpers ─────────────────────────────────────────────────────────────

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`px-4 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap border-r border-gray-100 last:border-r-0 ${right ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  );
}

function Td({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <td className={`px-4 py-3 text-xs text-gray-700 whitespace-nowrap border-r border-gray-100 last:border-r-0 ${right ? 'text-right' : 'text-left'}`}>
      {children}
    </td>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [activePeriod, setActivePeriod]   = useState<PeriodKey>('month');
  const [customRange, setCustomRange]     = useState<Period | null>(null);
  const [brandId, setBrandId]             = useState<string>('');
  const [product, setProduct]             = useState<ProductScope>('all');
  const [activeInnerTab, setActiveInnerTab] = useState<'charts' | 'breakdown'>('charts');

  const period: Period = useMemo(
    () => customRange ?? buildPeriod(activePeriod),
    [activePeriod, customRange],
  );

  const params = useMemo(
    () => ({ from: period.from, to: period.to, ...(brandId ? { brandId } : {}) }),
    [period.from, period.to, brandId],
  );

  const { data: brandsData } = useBaseQuery<BrandsResponse>({
    endpoint: BRANDS_API_URLS.LIST(),
    queryKey: ['brands'],
  });

  const { data, isLoading, isError } = useBaseQuery<OverviewResponse>({
    endpoint: REPORTS_API_URLS.OVERVIEW(),
    queryKey: ['dashboard-overview', params],
    params,
  });

  const s = data?.summary;

  const handlePeriodClick = (key: PeriodKey) => {
    setActivePeriod(key);
    setCustomRange(null);
  };

  return (
    <div className='h-full overflow-auto p-6 pb-24 space-y-6'>

      {/* Period selector */}
      <div className='space-y-3'>
        <div className='flex flex-wrap gap-2'>
          {PERIOD_BUTTONS.map((btn) => (
            <button
              key={btn.key}
              onClick={() => handlePeriodClick(btn.key)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                activePeriod === btn.key && !customRange
                  ? 'bg-primary text-white border-primary'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-primary hover:text-primary'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>

        <div className='flex flex-wrap items-center gap-2'>
          <div className='w-56'>
            <BSelectWithSearch
              placeholder='All Brands'
              value={brandId}
              onChange={setBrandId}
              options={(brandsData?.brands ?? []).map((b) => ({ label: b.name, value: b._id }))}
            />
          </div>
          <input
            type='date'
            value={customRange?.from ?? period.from}
            onChange={(e) => setCustomRange((r) => ({ from: e.target.value, to: r?.to ?? period.to }))}
            className='bg-white text-gray-700 text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary shadow-sm'
          />
          <span className='text-gray-400 text-sm'>→</span>
          <input
            type='date'
            value={customRange?.to ?? period.to}
            onChange={(e) => setCustomRange((r) => ({ from: r?.from ?? period.from, to: e.target.value }))}
            className='bg-white text-gray-700 text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary shadow-sm'
          />
        </div>
      </div>

      {/* KPI cards */}
      {isLoading && (
        <div className='grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4'>
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className='bg-white rounded-xl p-5 border border-gray-100 shadow-sm animate-pulse h-24' />
          ))}
        </div>
      )}

      {isError && <p className='text-red-500 text-sm'>Failed to load dashboard data.</p>}

      {!isLoading && !isError && (
        <>
          {/* Product tabs — swap KPI set + inner-tab data based on scope */}
          <div className='flex gap-1 bg-white p-1 rounded-lg border border-gray-200 shadow-sm w-fit'>
            {(['all', 'casino', 'sportsbook'] as ProductScope[]).map((p) => (
              <button
                key={p}
                onClick={() => setProduct(p)}
                className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-colors capitalize ${
                  product === p
                    ? 'bg-primary text-white'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {p === 'all' ? 'All products' : p}
              </button>
            ))}
          </div>

          {product === 'casino' && (
            <div className='grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4'>
              <KpiCard label='Registrations' value={String(s?.registrations ?? 0)} sub={`${s?.playerCount ?? 0} players`} />
              <KpiCard label='FTDs'          value={String(s?.ftdCount ?? 0)} sub={`€${fmt(s?.ftdSumCents ?? 0)}`} />
              <KpiCard label='Deposits'      value={`€${fmt(s?.depositsSumCents ?? 0)}`} sub={`${s?.depositsCount ?? 0} txns`} />
              <KpiCard label='Cashouts'      value={`€${fmt(s?.cashoutsSumCents ?? 0)}`} sub={`${s?.cashoutsCount ?? 0} txns`} />
              <KpiCard label='Casino GGR'    value={`€${fmt(s?.computedGgrCents ?? 0)}`} />
              <KpiCard label='Casino NGR'    value={`€${fmt(s?.computedNgrCents ?? 0)}`} accent />
              <KpiCard label='Rounds'        value={(s?.roundsCount ?? 0).toLocaleString()} />
              <KpiCard label='Bets'          value={`€${fmt(s?.betsSumCents ?? 0)}`} sub={`Wins €${fmt(s?.winsSumCents ?? 0)}`} />
              <KpiCard label='Chargebacks'   value={`€${fmt(s?.chargebacksSumCents ?? 0)}`} sub={`${s?.chargebacksCount ?? 0} txns`} />
            </div>
          )}

          {product === 'sportsbook' && (
            <div className='grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4'>
              <KpiCard label='Registrations' value={String(s?.registrations ?? 0)} sub={`${s?.playerCount ?? 0} players`} />
              <KpiCard label='FTDs'          value={String(s?.ftdCount ?? 0)} sub={`€${fmt(s?.ftdSumCents ?? 0)}`} />
              <KpiCard label='SB Bets'       value={`€${fmt(s?.sbBetsSumCents ?? 0)}`} sub={`Settled €${fmt(s?.sbSettledBetsSumCents ?? 0)}`} />
              <KpiCard label='SB Wins'       value={`€${fmt(s?.sbWinsSumCents ?? 0)}`} />
              <KpiCard label='SB GGR'        value={`€${fmt(s?.sbGgrCents ?? 0)}`} />
              <KpiCard label='SB NGR'        value={`€${fmt(s?.sbNgrCents ?? 0)}`} accent />
              <KpiCard label='Cancelled'     value={`€${fmt(s?.sbCancelledBetsSumCents ?? 0)}`} sub='operator-voided' />
              <KpiCard label='Rejected'      value={`€${fmt(s?.sbRejectedBetsSumCents ?? 0)}`} sub='not accepted' />
              <KpiCard label='SB 3rd-party'  value={`€${fmt(s?.sbThirdPartyFeesSumCents ?? 0)}`} sub='bookmaker fees' />
            </div>
          )}

          {product === 'all' && (
            <div className='grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4'>
              <KpiCard label='Registrations' value={String(s?.registrations ?? 0)} sub={`${s?.playerCount ?? 0} players`} />
              <KpiCard label='FTDs'          value={String(s?.ftdCount ?? 0)} sub={`€${fmt(s?.ftdSumCents ?? 0)}`} />
              <KpiCard label='Deposits'      value={`€${fmt(s?.depositsSumCents ?? 0)}`} sub={`${s?.depositsCount ?? 0} txns`} />
              <KpiCard label='Cashouts'      value={`€${fmt(s?.cashoutsSumCents ?? 0)}`} sub={`${s?.cashoutsCount ?? 0} txns`} />
              <KpiCard label='Combined NGR'  value={`€${fmt(s?.combinedNgrCents ?? 0)}`} accent />
              <KpiCard label='Casino NGR'    value={`€${fmt(s?.computedNgrCents ?? 0)}`} sub={`GGR €${fmt(s?.computedGgrCents ?? 0)}`} />
              <KpiCard label='SB NGR'        value={`€${fmt(s?.sbNgrCents ?? 0)}`} sub={`GGR €${fmt(s?.sbGgrCents ?? 0)}`} />
              <KpiCard label='Rounds'        value={(s?.roundsCount ?? 0).toLocaleString()} />
              <KpiCard label='Chargebacks'   value={`€${fmt(s?.chargebacksSumCents ?? 0)}`} sub={`${s?.chargebacksCount ?? 0} txns`} />
            </div>
          )}

          {/* Inner tab switcher */}
          <div className='flex gap-1 bg-white p-1 rounded-lg w-full border border-gray-200 shadow-sm'>
            {(['charts', 'breakdown'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveInnerTab(tab)}
                className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  activeInnerTab === tab
                    ? 'bg-primary text-white'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab === 'charts' ? 'Quick Charts' : 'Daily Breakdown'}
              </button>
            ))}
          </div>

          {activeInnerTab === 'charts' && <QuickCharts brandsData={brandsData} product={product} />}

          {activeInnerTab === 'breakdown' && (
            <>
              {(data?.byDay?.length ?? 0) > 0 ? (
                <div className='bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100'>
                  <div className='px-5 py-3 border-b border-gray-100 flex items-center justify-between'>
                    <p className='text-sm font-medium text-gray-800'>Daily Breakdown</p>
                    <p className='text-xs text-gray-400'>{data!.byDay.length} days</p>
                  </div>
                  <div className='overflow-x-auto'>
                    <table className='w-full'>
                      <thead className='bg-gray-50'>
                        <tr>
                          <Th>Date</Th>
                          <Th right>Regs</Th>
                          <Th right>FTDs</Th>
                          <Th right>FTD Sum (€)</Th>
                          <Th right>Deposits (€)</Th>
                          <Th right>Cashouts (€)</Th>
                          <Th right>GGR (€)</Th>
                          <Th right>NGR (€)</Th>
                          <Th right>Rounds</Th>
                        </tr>
                      </thead>
                      <tbody className='divide-y divide-gray-100'>
                        {data!.byDay.map((row, i) => (
                          <tr key={row.date} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                            <Td>{row.date}</Td>
                            <Td right>{row.registrations}</Td>
                            <Td right>{row.ftdCount}</Td>
                            <Td right>{fmt(row.ftdSumCents)}</Td>
                            <Td right>{fmt(row.depositsSumCents)}</Td>
                            <Td right>{fmt(row.cashoutsSumCents)}</Td>
                            <Td right>{fmt(row.computedGgrCents)}</Td>
                            <Td right>{fmt(row.computedNgrCents)}</Td>
                            <Td right>{row.roundsCount.toLocaleString()}</Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className='bg-white rounded-xl p-8 shadow-sm border border-gray-100 text-center'>
                  <p className='text-gray-400 text-sm'>No activity data for the selected period.</p>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
