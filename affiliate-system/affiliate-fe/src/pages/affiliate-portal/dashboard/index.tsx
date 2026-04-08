import { useMemo, useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useBaseQuery } from 'api/core/useBaseQuery';
import { AFFILIATE_PORTAL_API_URLS } from 'config/apiUrls';

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
  ggrCents: number;
  ngrCents: number;
  roundsCount: number;
  playerCount: number;
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
  referralCodes: string[];
}

// ── KPI card ──────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, accent }: {
  label: string; value: string; sub?: string; accent?: boolean;
}) {
  return (
    <div className={`rounded-xl p-5 shadow-sm border ${accent ? 'bg-primary border-primary/20' : 'bg-white border-gray-100'}`}>
      <p className={`text-xs mb-1 ${accent ? 'text-blue-100' : 'text-gray-500'}`}>{label}</p>
      <p className={`text-xl font-semibold ${accent ? 'text-white' : 'text-gray-800'}`}>{value}</p>
      {sub && <p className={`text-xs mt-1 ${accent ? 'text-blue-200' : 'text-gray-400'}`}>{sub}</p>}
    </div>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function AffiliateDashboard() {
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

  const s   = data?.summary;
  const com = data?.commission;

  return (
    <div className='bg-gray-100 h-full overflow-auto p-6 pb-24 space-y-6'>

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
          <span className='text-gray-400 text-sm'>→</span>
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
          {/* Traffic KPIs */}
          <div>
            <p className='text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3'>Traffic</p>
            <div className='grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4'>
              <KpiCard label='Registrations' value={String(s?.registrations ?? 0)} sub={`${s?.playerCount ?? 0} active players`} />
              <KpiCard label='FTDs'          value={String(s?.ftdCount ?? 0)} sub={`€${fmt(s?.ftdSumCents ?? 0)}`} />
              <KpiCard label='Deposits'      value={`€${fmt(s?.depositsSumCents ?? 0)}`} sub={`${s?.depositsCount ?? 0} txns`} />
              <KpiCard label='Rounds'        value={(s?.roundsCount ?? 0).toLocaleString()} />
            </div>
          </div>

          {/* Revenue KPIs */}
          <div>
            <p className='text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3'>Revenue</p>
            <div className='grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4'>
              <KpiCard label='GGR'           value={`€${fmt(s?.ggrCents ?? 0)}`} />
              <KpiCard label='NGR'           value={`€${fmt(s?.ngrCents ?? 0)}`} accent />
            </div>
          </div>

          {/* Commission summary */}
          <div>
            <p className='text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3'>My Commissions</p>
            <div className='grid grid-cols-2 sm:grid-cols-4 gap-4'>
              <KpiCard label='Total Earned'  value={`€${fmt(com?.totalEarned ?? 0)}`} />
              <KpiCard label='Approved'      value={`€${fmt(com?.totalApproved ?? 0)}`} />
              <KpiCard label='Paid'          value={`€${fmt(com?.totalPaid ?? 0)}`} />
              <KpiCard label='Pending'       value={`€${fmt(com?.totalPending ?? 0)}`} />
            </div>
          </div>

          {/* Activity chart */}
          {(data?.byDay?.length ?? 0) > 0 && (
            <div className='bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-4'>
              <h2 className='text-sm font-semibold text-gray-800'>Registrations Over Time</h2>
              <ResponsiveContainer width='100%' height={220}>
                <AreaChart
                  data={data!.byDay.map(r => ({ date: r.date, registrations: r.registrations }))}
                  margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id='affiliateGrad' x1='0' y1='0' x2='0' y2='1'>
                      <stop offset='5%'  stopColor='#2563EB' stopOpacity={0.15} />
                      <stop offset='95%' stopColor='#2563EB' stopOpacity={0}    />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray='3 3' stroke='#f1f5f9' />
                  <XAxis dataKey='date' tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} interval='preserveStartEnd' />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} width={40} />
                  <Tooltip
                    formatter={(v: number | undefined) => [v ?? 0, 'Registrations']}
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                    labelStyle={{ color: '#475569', fontWeight: 600 }}
                  />
                  <Area type='monotone' dataKey='registrations' stroke='#2563EB' strokeWidth={2} fill='url(#affiliateGrad)' dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {(data?.byDay?.length ?? 0) === 0 && (
            <div className='bg-white rounded-xl p-8 shadow-sm border border-gray-100 text-center'>
              <p className='text-gray-400 text-sm'>No activity data for the selected period.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
