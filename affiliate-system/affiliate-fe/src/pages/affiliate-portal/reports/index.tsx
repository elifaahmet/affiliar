import { useMemo, useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useBaseQuery } from 'api/core/useBaseQuery';
import { AFFILIATE_PORTAL_API_URLS } from 'config/apiUrls';

// ── helpers ───────────────────────────────────────────────────────────────────

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

type PeriodKey = 'today' | 'yesterday' | 'week' | 'last_week' | 'month' | 'last_month' | 'year';
interface Period { from: string; to: string }

function buildPeriod(key: PeriodKey): Period {
  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monday = (d: Date) => {
    const day = d.getDay() || 7;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() - day + 1);
  };
  switch (key) {
    case 'yesterday': { const y = new Date(today); y.setDate(y.getDate() - 1); return { from: ymd(y), to: ymd(y) }; }
    case 'today':      return { from: ymd(today), to: ymd(today) };
    case 'week':      { const mon = monday(today); const sun = new Date(mon); sun.setDate(mon.getDate() + 6); return { from: ymd(mon), to: ymd(sun) }; }
    case 'last_week': { const lm = monday(today); lm.setDate(lm.getDate() - 7); const le = new Date(lm); le.setDate(le.getDate() + 6); return { from: ymd(lm), to: ymd(le) }; }
    case 'month':     { const first = new Date(today.getFullYear(), today.getMonth(), 1); const last = new Date(today.getFullYear(), today.getMonth() + 1, 0); return { from: ymd(first), to: ymd(last) }; }
    case 'last_month':{ const first = new Date(today.getFullYear(), today.getMonth() - 1, 1); const last = new Date(today.getFullYear(), today.getMonth(), 0); return { from: ymd(first), to: ymd(last) }; }
    case 'year':      { const first = new Date(today.getFullYear(), 0, 1); const last = new Date(today.getFullYear(), 11, 31); return { from: ymd(first), to: ymd(last) }; }
  }
}

const PERIOD_BUTTONS: { key: PeriodKey; label: string }[] = [
  { key: 'today',      label: 'Today'      },
  { key: 'yesterday',  label: 'Yesterday'  },
  { key: 'week',       label: 'This Week'  },
  { key: 'last_week',  label: 'Last Week'  },
  { key: 'month',      label: 'This Month' },
  { key: 'last_month', label: 'Last Month' },
  { key: 'year',       label: 'This Year'  },
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
  chargebacksSumCents: number;
  bonusIssuesSumCents: number;
  correctionsUpSumCents: number;
  correctionsDownSumCents: number;
  ggrCents: number;
  ngrCents: number;
  roundsCount: number;
  playerCount: number;
  // Sportsbook (optional — 0 when nothing ingested yet)
  sbBetsSumCents?: number;
  sbWinsSumCents?: number;
  sbCancelledBetsSumCents?: number;
  sbRejectedBetsSumCents?: number;
  sbSettledBetsSumCents?: number;
  sbGgrCents?: number;
  sbNgrCents?: number;
  combinedGgrCents?: number;
  combinedNgrCents?: number;
}

interface CommissionSummary {
  totalEarned: number;
  totalPaid: number;
  totalPending: number;
  totalApproved: number;
}

interface OverviewResponse {
  period: Period;
  summary: Omit<DayRow, 'date'>;
  byDay: DayRow[];
  commission: CommissionSummary;
  referralCodes: { code: string; brandId: string | null; brandName: string | null; brandUrl: string | null }[];
}

// ── Multi-metric chart configuration ─────────────────────────────────────────

interface ChartMetricDef {
  key: string;
  label: string;
  isCents?: boolean;
  isRate?: boolean;
  computed?: (r: DayRow) => number;
}

const CHART_METRICS: ChartMetricDef[] = [
  { key: 'registrations',          label: 'Registrations'    },
  { key: 'playerCount',            label: 'Players'          },
  { key: 'ftdCount',               label: 'FTD Count'        },
  { key: 'ftdSumCents',            label: 'FTD Sum',          isCents: true },
  { key: 'ftdConversionRate',      label: 'FTD Conversion %', isRate: true,
    computed: (r) => r.registrations > 0 ? (r.ftdCount / r.registrations) * 100 : 0 },
  { key: 'depositsCount',          label: 'Deposits Count'   },
  { key: 'depositsSumCents',       label: 'Deposits Sum',     isCents: true },
  { key: 'cashoutsCount',          label: 'Cashouts Count'   },
  { key: 'cashoutsSumCents',       label: 'Cashouts Sum',     isCents: true },
  { key: 'chargebacksSumCents',    label: 'Chargebacks',      isCents: true },
  { key: 'combinedGgrCents',       label: 'Combined GGR',     isCents: true },
  { key: 'combinedNgrCents',       label: 'Combined NGR',     isCents: true },
  { key: 'roundsCount',            label: 'Rounds'           },
  { key: 'ggrCents',               label: 'Casino GGR',       isCents: true },
  { key: 'ngrCents',               label: 'Casino NGR',       isCents: true },
  { key: 'bonusIssuesSumCents',    label: 'Bonus Issued',     isCents: true },
  { key: 'sbBetsSumCents',         label: 'SB Bets',          isCents: true },
  { key: 'sbWinsSumCents',         label: 'SB Wins',          isCents: true },
  { key: 'sbGgrCents',             label: 'SB GGR',           isCents: true },
  { key: 'sbNgrCents',             label: 'SB NGR',           isCents: true },
];

function buildMetricPoints(rows: DayRow[], def: ChartMetricDef) {
  return rows.map((r) => ({
    date: r.date,
    value: def.computed
      ? def.computed(r)
      : def.isCents
        ? ((r as any)[def.key] ?? 0) / 100
        : ((r as any)[def.key] ?? 0),
  }));
}

function formatChartTick(v: number, def: ChartMetricDef) {
  if (def.isRate) return `${v.toFixed(1)}%`;
  if (def.isCents) return `€${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0)}`;
  return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v);
}

function formatChartTooltip(v: number, def: ChartMetricDef) {
  if (def.isRate) return `${v.toFixed(2)}%`;
  if (def.isCents) return `€${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return v.toLocaleString();
}

// ── Fee details payload ──────────────────────────────────────────────────────

interface FeeBlock {
  depositFeePercent: number | null;
  withdrawalFeePercent: number | null;
  jackpotFeePercent: number | null;
  casinoTaxPercent: number | null;
  sbThirdPartyFeePercent: number | null;
  customNgrFeePercent: number | null;
  customDepositFeePercent: number | null;
  alwaysDeductCustomFees?: boolean;
}

interface FeeDetailsResponse {
  operatorDefaults: FeeBlock | null;
  brandOverrides: Array<FeeBlock & { brandId: string; brandName: string | null }>;
  providerRates: Array<{
    providerId: string;
    providerName: string;
    brandId: string | null;
    brandName: string | null;
    feePercent: number;
  }>;
}

function pct(value: number | null | undefined) {
  if (value === null || value === undefined) return '—';
  return `${value}%`;
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function AffiliateReports() {
  const [activePeriod, setActivePeriod] = useState<PeriodKey>('month');
  const [customRange, setCustomRange]   = useState<Period | null>(null);

  const period: Period = useMemo(
    () => customRange ?? buildPeriod(activePeriod),
    [activePeriod, customRange],
  );

  const params = useMemo(
    () => ({ from: period.from, to: period.to }),
    [period.from, period.to],
  );

  const { data, isLoading, isError } = useBaseQuery<OverviewResponse>({
    endpoint: AFFILIATE_PORTAL_API_URLS.OVERVIEW(),
    queryKey: ['affiliate-overview', params],
    params,
  });

  return (
    <div className='h-full overflow-auto p-6 pb-24 space-y-6'>

      {/* Period selector */}
      <div className='space-y-3'>
        <div className='flex flex-wrap gap-2'>
          {PERIOD_BUTTONS.map((btn) => (
            <button
              key={btn.key}
              onClick={() => { setActivePeriod(btn.key); setCustomRange(null); }}
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
          <input
            type='date' value={customRange?.from ?? period.from}
            onChange={(e) => setCustomRange((r) => ({ from: e.target.value, to: r?.to ?? period.to }))}
            className='bg-white text-gray-700 text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary shadow-sm'
          />
          <span className='text-gray-600 text-sm'>→</span>
          <input
            type='date' value={customRange?.to ?? period.to}
            onChange={(e) => setCustomRange((r) => ({ from: r?.from ?? period.from, to: e.target.value }))}
            className='bg-white text-gray-700 text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary shadow-sm'
          />
        </div>
      </div>

      {isLoading && (
        <div className='grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4'>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className='bg-white rounded-xl p-5 border border-gray-100 shadow-sm animate-pulse h-24' />
          ))}
        </div>
      )}

      {isError && <p className='text-red-500 text-sm'>Failed to load dashboard data.</p>}

      {!isLoading && !isError && (
        <>
          {/* Quick Charts — same metric set the operator dashboard offers,
              scoped to this affiliate plus optional code / campaign / sub
              drill-down filters on top of the page-level period. */}
          <QuickCharts
            period={period}
            referralCodes={(data?.referralCodes ?? []).map((rc) => rc.code)}
          />

          {/* Fee details — operator-set policy the affiliate's NGR is
              calculated against. Read-only. */}
          <FeeDetails />
        </>
      )}
    </div>
  );
}

// ── Quick Charts (multi-metric picker) ───────────────────────────────────────

function QuickCharts({
  period,
  referralCodes,
}: {
  period: Period;
  referralCodes: string[];
}) {
  const [metricKey, setMetricKey] = useState('registrations');
  const [filterCode, setFilterCode]     = useState('');
  const [filterCampaign, setFilterCampaign] = useState('');
  const [filterSub, setFilterSub]       = useState('');

  const def = useMemo(
    () => CHART_METRICS.find((m) => m.key === metricKey) ?? CHART_METRICS[0],
    [metricKey],
  );

  // Self-fetched, filter-aware byDay. QuickCharts re-queries with code /
  // campaign / sub merged in when the affiliate narrows.
  const chartParams = useMemo(() => {
    const p: Record<string, string> = { from: period.from, to: period.to };
    if (filterCode)     p.affiliateCode = filterCode;
    if (filterCampaign) p.campaign      = filterCampaign;
    if (filterSub)      p.subId         = filterSub;
    return p;
  }, [period.from, period.to, filterCode, filterCampaign, filterSub]);

  const { data: chartData, isLoading } = useBaseQuery<OverviewResponse>({
    endpoint: AFFILIATE_PORTAL_API_URLS.OVERVIEW(),
    queryKey: ['affiliate-chart-overview', chartParams],
    params: chartParams,
  });

  const points = useMemo(
    () => (def ? buildMetricPoints(chartData?.byDay ?? [], def) : []),
    [chartData, def],
  );

  if (!def) return null;

  const hasActiveFilter = Boolean(filterCode || filterCampaign || filterSub);

  return (
    <div className='bg-white/80 backdrop-blur-sm rounded-xl border border-violet-100 p-5 space-y-4'>
      <div className='flex items-center justify-between gap-3 flex-wrap'>
        <h2 className='text-sm font-semibold text-gray-800'>Charts</h2>
        <select
          value={def.key}
          onChange={(e) => setMetricKey(e.target.value)}
          className='bg-white text-gray-700 text-xs rounded-lg px-2 py-1.5 border border-gray-200 focus:outline-none focus:border-primary shadow-sm'
        >
          {CHART_METRICS.map((m) => (
            <option key={m.key} value={m.key}>{m.label}</option>
          ))}
        </select>
      </div>

      {/* Filter row */}
      <div className='grid grid-cols-1 sm:grid-cols-3 gap-3'>
        <label className='flex flex-col gap-1'>
          <span className='text-[10px] font-medium uppercase tracking-[0.1em] text-gray-600'>Referral code</span>
          <select
            value={filterCode}
            onChange={(e) => setFilterCode(e.target.value)}
            className='bg-white text-gray-700 text-xs rounded-lg px-2 py-1.5 border border-gray-200 focus:outline-none focus:border-primary shadow-sm'
          >
            <option value=''>All codes</option>
            {referralCodes.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className='flex flex-col gap-1'>
          <span className='text-[10px] font-medium uppercase tracking-[0.1em] text-gray-600'>Campaign</span>
          <input
            type='text'
            value={filterCampaign}
            onChange={(e) => setFilterCampaign(e.target.value)}
            placeholder='e.g. summer_promo'
            className='bg-white text-gray-700 text-xs rounded-lg px-2 py-1.5 border border-gray-200 focus:outline-none focus:border-primary shadow-sm'
          />
        </label>
        <label className='flex flex-col gap-1'>
          <span className='text-[10px] font-medium uppercase tracking-[0.1em] text-gray-600'>Sub</span>
          <input
            type='text'
            value={filterSub}
            onChange={(e) => setFilterSub(e.target.value)}
            placeholder='e.g. banner_1'
            className='bg-white text-gray-700 text-xs rounded-lg px-2 py-1.5 border border-gray-200 focus:outline-none focus:border-primary shadow-sm'
          />
        </label>
      </div>
      {hasActiveFilter && (
        <button
          type='button'
          onClick={() => { setFilterCode(''); setFilterCampaign(''); setFilterSub(''); }}
          className='text-xs font-medium text-primary hover:text-primary-dark'
        >
          Clear filters
        </button>
      )}

      {isLoading ? (
        <div className='h-52 bg-gray-50 rounded-lg animate-pulse' />
      ) : points.length === 0 ? (
        <div className='h-52 flex items-center justify-center'>
          <p className='text-sm text-gray-600'>No data for the selected range.</p>
        </div>
      ) : (
        <ResponsiveContainer width='100%' height={240}>
          <AreaChart data={points} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id='reportsGrad' x1='0' y1='0' x2='0' y2='1'>
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
              tickFormatter={(v) => formatChartTick(v, def)}
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              tickLine={false}
              axisLine={false}
              width={60}
            />
            <Tooltip
              formatter={(v: number | undefined) => [formatChartTooltip(v ?? 0, def), def.label]}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
              labelStyle={{ color: '#475569', fontWeight: 600 }}
            />
            <Area
              type='monotone'
              dataKey='value'
              stroke='#8B5CF6'
              strokeWidth={2}
              fill='url(#reportsGrad)'
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ── Fee Details (read-only operator policy) ──────────────────────────────────

function FeeDetails() {
  const { data, isLoading } = useBaseQuery<FeeDetailsResponse>({
    endpoint: AFFILIATE_PORTAL_API_URLS.FEE_DETAILS(),
    queryKey: ['affiliate-fee-details'],
  });

  return (
    <div className='bg-white/80 backdrop-blur-sm rounded-xl border border-violet-100 p-6 space-y-5'>
      <div>
        <h2 className='text-sm font-semibold text-gray-800'>Fee Details</h2>
        <p className='text-xs text-gray-600 mt-0.5'>
          The fee percentages your operator applies before NGR is computed for your commission.
        </p>
      </div>

      {isLoading && (
        <div className='h-24 bg-gray-50 rounded-lg animate-pulse' />
      )}

      {!isLoading && data && (
        <>
          {/* Operator defaults */}
          {data.operatorDefaults && (
            <div>
              <p className='text-[11px] font-medium uppercase tracking-[0.12em] text-gray-600 mb-2'>
                Operator defaults
              </p>
              <div className='grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3'>
                <FeeChip label='Deposit'        value={pct(data.operatorDefaults.depositFeePercent)} />
                <FeeChip label='Withdrawal'     value={pct(data.operatorDefaults.withdrawalFeePercent)} />
                <FeeChip label='Jackpot'        value={pct(data.operatorDefaults.jackpotFeePercent)} />
                <FeeChip label='Casino Tax'     value={pct(data.operatorDefaults.casinoTaxPercent)} />
                <FeeChip label='SB 3rd-party'   value={pct(data.operatorDefaults.sbThirdPartyFeePercent)} />
                <FeeChip label='Custom NGR'     value={pct(data.operatorDefaults.customNgrFeePercent)} />
                <FeeChip label='Custom Deposit' value={pct(data.operatorDefaults.customDepositFeePercent)} />
              </div>
              {(data.operatorDefaults.customNgrFeePercent ||
                data.operatorDefaults.customDepositFeePercent) ? (
                <p className='text-[11px] text-gray-500 mt-2'>
                  Custom deductions are{' '}
                  <b>
                    {data.operatorDefaults.alwaysDeductCustomFees
                      ? 'always applied'
                      : 'applied only when the operator hasn\'t published additional deductions for the bucket'}
                  </b>
                  .
                </p>
              ) : null}
            </div>
          )}

          {/* Per-brand overrides */}
          {data.brandOverrides.length > 0 && (
            <div>
              <p className='text-[11px] font-medium uppercase tracking-[0.12em] text-gray-600 mb-2'>
                Per-brand overrides
              </p>
              <div className='overflow-x-auto rounded-lg border border-gray-100'>
                <table className='w-full text-xs'>
                  <thead className='bg-gray-50'>
                    <tr>
                      <th className='px-3 py-2 text-left font-semibold text-gray-700'>Brand</th>
                      <th className='px-3 py-2 text-right font-semibold text-gray-700'>Deposit</th>
                      <th className='px-3 py-2 text-right font-semibold text-gray-700'>Withdrawal</th>
                      <th className='px-3 py-2 text-right font-semibold text-gray-700'>Jackpot</th>
                      <th className='px-3 py-2 text-right font-semibold text-gray-700'>Casino Tax</th>
                      <th className='px-3 py-2 text-right font-semibold text-gray-700'>SB 3rd-party</th>
                      <th className='px-3 py-2 text-right font-semibold text-gray-700'>Custom NGR</th>
                      <th className='px-3 py-2 text-right font-semibold text-gray-700'>Custom Dep.</th>
                    </tr>
                  </thead>
                  <tbody className='divide-y divide-gray-100'>
                    {data.brandOverrides.map((b) => (
                      <tr key={b.brandId}>
                        <td className='px-3 py-2 text-gray-800 font-medium'>{b.brandName || b.brandId}</td>
                        <td className='px-3 py-2 text-right text-gray-700'>{pct(b.depositFeePercent)}</td>
                        <td className='px-3 py-2 text-right text-gray-700'>{pct(b.withdrawalFeePercent)}</td>
                        <td className='px-3 py-2 text-right text-gray-700'>{pct(b.jackpotFeePercent)}</td>
                        <td className='px-3 py-2 text-right text-gray-700'>{pct(b.casinoTaxPercent)}</td>
                        <td className='px-3 py-2 text-right text-gray-700'>{pct(b.sbThirdPartyFeePercent)}</td>
                        <td className='px-3 py-2 text-right text-gray-700'>{pct(b.customNgrFeePercent)}</td>
                        <td className='px-3 py-2 text-right text-gray-700'>{pct(b.customDepositFeePercent)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Provider rates */}
          {data.providerRates.length > 0 && (
            <div>
              <p className='text-[11px] font-medium uppercase tracking-[0.12em] text-gray-600 mb-2'>
                Game provider fees
              </p>
              <div className='overflow-x-auto rounded-lg border border-gray-100'>
                <table className='w-full text-xs'>
                  <thead className='bg-gray-50'>
                    <tr>
                      <th className='px-3 py-2 text-left font-semibold text-gray-700'>Provider</th>
                      <th className='px-3 py-2 text-left font-semibold text-gray-700'>Brand</th>
                      <th className='px-3 py-2 text-right font-semibold text-gray-700'>Fee</th>
                    </tr>
                  </thead>
                  <tbody className='divide-y divide-gray-100'>
                    {data.providerRates.map((p, i) => (
                      <tr key={`${p.providerId}-${p.brandId ?? 'default'}-${i}`}>
                        <td className='px-3 py-2 text-gray-800 font-medium'>{p.providerName || p.providerId}</td>
                        <td className='px-3 py-2 text-gray-700'>{p.brandId ? (p.brandName || p.brandId) : 'All brands (default)'}</td>
                        <td className='px-3 py-2 text-right text-gray-700'>{pct(p.feePercent)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!data.operatorDefaults && data.brandOverrides.length === 0 && data.providerRates.length === 0 && (
            <p className='text-xs text-gray-600'>Your operator hasn't configured any fee rates yet.</p>
          )}
        </>
      )}
    </div>
  );
}

function FeeChip({ label, value }: { label: string; value: string }) {
  return (
    <div className='rounded-lg border border-gray-100 bg-gray-50 px-3 py-2'>
      <p className='text-[10px] font-medium uppercase tracking-[0.1em] text-gray-600 mb-0.5'>{label}</p>
      <p className='text-sm font-semibold text-gray-900'>{value}</p>
    </div>
  );
}
