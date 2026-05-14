import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useBaseQuery } from 'api/core/useBaseQuery';
import { AFFILIATE_PORTAL_API_URLS } from 'config/apiUrls';

// Slim affiliate landing page: at-a-glance widgets only. Deep date-filtered
// traffic / providers / breakdowns live on /affiliate/reports.

function fmt(cents: number) {
  return (cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function thisMonth() {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from: ymd(first), to: ymd(last) };
}

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
  sbNgrCents?: number;
  combinedNgrCents?: number;
  playerCount: number;
}

interface CommissionSummary {
  totalEarned: number;
  totalPaid: number;
  totalPending: number;
  totalApproved: number;
}

interface OverviewResponse {
  period: { from: string; to: string };
  summary: Omit<DayRow, 'date'>;
  byDay: DayRow[];
  commission: CommissionSummary;
}

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-xl p-5 border transition-shadow ${
        accent
          ? 'bg-gradient-to-br from-primary to-primary-dark border-primary/30 shadow-lg shadow-primary/20'
          : 'bg-white/80 backdrop-blur-sm border-violet-100 hover:shadow-sm'
      }`}
    >
      <p
        className={`text-[11px] font-medium uppercase tracking-[0.12em] mb-2 ${
          accent ? 'text-violet-100' : 'text-gray-600'
        }`}
      >
        {label}
      </p>
      <p
        className={`text-2xl font-semibold tracking-tight ${
          accent ? 'text-white' : 'text-gray-900'
        }`}
      >
        {value}
      </p>
      {sub && (
        <p className={`text-xs mt-1 ${accent ? 'text-violet-200' : 'text-gray-600'}`}>
          {sub}
        </p>
      )}
    </div>
  );
}

export default function AffiliateDashboard() {
  const period = useMemo(thisMonth, []);
  const params = useMemo(() => ({ from: period.from, to: period.to }), [period]);

  const { data, isLoading, isError } = useBaseQuery<OverviewResponse>({
    endpoint: AFFILIATE_PORTAL_API_URLS.OVERVIEW(),
    queryKey: ['affiliate-overview-home', params],
    params,
  });

  const s = data?.summary;
  const com = data?.commission;

  return (
    <div className='h-full overflow-auto p-6 pb-24 space-y-6'>
      <div className='flex items-center justify-between'>
        <div>
          <p className='text-xs font-medium uppercase tracking-[0.12em] text-gray-600 mb-1'>
            This month
          </p>
          <h1 className='text-lg font-semibold text-gray-900'>
            At-a-glance
          </h1>
        </div>
        <Link
          to='/affiliate/reports'
          className='text-xs font-medium text-primary hover:text-primary-dark'
        >
          View full reports →
        </Link>
      </div>

      {isLoading && (
        <div className='grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4'>
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className='bg-white rounded-xl p-5 border border-gray-100 shadow-sm animate-pulse h-24'
            />
          ))}
        </div>
      )}

      {isError && (
        <p className='text-red-500 text-sm'>Failed to load dashboard data.</p>
      )}

      {!isLoading && !isError && (
        <>
          {/* My Commissions */}
          <div>
            <p className='text-xs font-semibold text-gray-700 uppercase tracking-wider mb-3'>My Commissions</p>
            <div className='grid grid-cols-2 sm:grid-cols-4 gap-4'>
              <KpiCard label='Total Earned' value={`€${fmt(com?.totalEarned ?? 0)}`} accent />
              <KpiCard label='Approved' value={`€${fmt(com?.totalApproved ?? 0)}`} />
              <KpiCard label='Paid' value={`€${fmt(com?.totalPaid ?? 0)}`} />
              <KpiCard label='Pending' value={`€${fmt(com?.totalPending ?? 0)}`} />
            </div>
          </div>

          {/* Traffic */}
          <div>
            <p className='text-xs font-semibold text-gray-700 uppercase tracking-wider mb-3'>Traffic</p>
            <div className='grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4'>
              <KpiCard
                label='Registrations'
                value={String(s?.registrations ?? 0)}
                sub={`${s?.playerCount ?? 0} active players`}
              />
              <KpiCard
                label='FTDs'
                value={String(s?.ftdCount ?? 0)}
                sub={`€${fmt(s?.ftdSumCents ?? 0)}`}
              />
              <KpiCard
                label='Deposits'
                value={`€${fmt(s?.depositsSumCents ?? 0)}`}
                sub={`${s?.depositsCount ?? 0} txns`}
              />
              <KpiCard
                label='Cashouts'
                value={`€${fmt(s?.cashoutsSumCents ?? 0)}`}
                sub={`${s?.cashoutsCount ?? 0} txns`}
              />
            </div>
          </div>

          {/* Revenue */}
          <div>
            <p className='text-xs font-semibold text-gray-700 uppercase tracking-wider mb-3'>Revenue</p>
            <div className='grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4'>
              <KpiCard
                label='Combined NGR'
                value={`€${fmt(s?.combinedNgrCents ?? s?.ngrCents ?? 0)}`}
                accent
              />
              <KpiCard
                label='Casino NGR'
                value={`€${fmt(s?.ngrCents ?? 0)}`}
                sub={`GGR €${fmt(s?.ggrCents ?? 0)}`}
              />
              <KpiCard
                label='SB NGR'
                value={`€${fmt(s?.sbNgrCents ?? 0)}`}
              />
            </div>
          </div>

          {/* Adjustments */}
          <div>
            <p className='text-xs font-semibold text-gray-700 uppercase tracking-wider mb-3'>Adjustments</p>
            <div className='grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4'>
              <KpiCard
                label='Chargebacks'
                value={`€${fmt(s?.chargebacksSumCents ?? 0)}`}
              />
              <KpiCard
                label='Bonus Issued'
                value={`€${fmt(s?.bonusIssuesSumCents ?? 0)}`}
              />
              <KpiCard
                label='Corrections Up'
                value={`€${fmt(s?.correctionsUpSumCents ?? 0)}`}
                sub='casino recovered'
              />
              <KpiCard
                label='Corrections Down'
                value={`€${fmt(s?.correctionsDownSumCents ?? 0)}`}
                sub='casino gifted'
              />
            </div>
          </div>

          {/* Registrations sparkline — the only chart on the home page */}
          {(data?.byDay?.length ?? 0) > 0 && (
            <div className='bg-white/80 backdrop-blur-sm rounded-xl border border-violet-100 p-5 space-y-4'>
              <h2 className='text-sm font-semibold text-gray-800'>
                Registrations this month
              </h2>
              <ResponsiveContainer width='100%' height={180}>
                <AreaChart
                  data={data!.byDay.map((r) => ({
                    date: r.date,
                    registrations: r.registrations,
                  }))}
                  margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id='homeGrad' x1='0' y1='0' x2='0' y2='1'>
                      <stop offset='5%' stopColor='#2563EB' stopOpacity={0.15} />
                      <stop offset='95%' stopColor='#2563EB' stopOpacity={0} />
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
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    tickLine={false}
                    axisLine={false}
                    width={40}
                  />
                  <Tooltip
                    formatter={(v: number | undefined) => [v ?? 0, 'Registrations']}
                    contentStyle={{
                      fontSize: 12,
                      borderRadius: 8,
                      border: '1px solid #e2e8f0',
                    }}
                    labelStyle={{ color: '#475569', fontWeight: 600 }}
                  />
                  <Area
                    type='monotone'
                    dataKey='registrations'
                    stroke='#2563EB'
                    strokeWidth={2}
                    fill='url(#homeGrad)'
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {(data?.byDay?.length ?? 0) === 0 && (
            <div className='bg-white rounded-xl p-8 shadow-sm border border-gray-100 text-center'>
              <p className='text-gray-600 text-sm'>
                No activity yet this month. Share your referral links to start
                tracking.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
