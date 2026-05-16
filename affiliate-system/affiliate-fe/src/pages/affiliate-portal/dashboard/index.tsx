import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useBaseQuery } from 'api/core/useBaseQuery';
import { AFFILIATE_PORTAL_API_URLS } from 'config/apiUrls';
import { storageHelper } from 'utils/storage/StorageHelper';
import { STORAGE_KEYS } from 'utils/common/constants';

interface SubAffiliateRow {
  _id: string;
  username: string;
  email: string;
  name: string;
  parentAffiliate: string | null;
}
interface SubAffiliatesResponse { subAffiliates: SubAffiliateRow[]; total: number }

// Affiliate landing page: at-a-glance widgets with a date filter. Deep
// charts / providers / fee details live on /affiliate/reports.

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
    case 'today':     return { from: ymd(today), to: ymd(today) };
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
  const [activePeriod, setActivePeriod] = useState<PeriodKey>('month');
  const [customRange, setCustomRange]   = useState<Period | null>(null);
  const [forAffiliateId, setForAffiliateId] = useState<string>('');

  const callerId = useMemo(
    () => storageHelper.getStoreWithDecryption(STORAGE_KEYS.USER_ID) || '',
    [],
  );

  const { data: subAffiliates } = useBaseQuery<SubAffiliatesResponse>({
    endpoint: AFFILIATE_PORTAL_API_URLS.SUB_AFFILIATES(),
    queryKey: ['affiliate-sub-affiliates-dashboard'],
  });
  const subs = subAffiliates?.subAffiliates ?? [];

  const period: Period = useMemo(
    () => customRange ?? buildPeriod(activePeriod),
    [activePeriod, customRange],
  );

  const params = useMemo(() => {
    const p: Record<string, string> = { from: period.from, to: period.to };
    if (forAffiliateId) p.forAffiliateId = forAffiliateId;
    return p;
  }, [period, forAffiliateId]);

  const { data, isLoading, isError } = useBaseQuery<OverviewResponse>({
    endpoint: AFFILIATE_PORTAL_API_URLS.OVERVIEW(),
    queryKey: ['affiliate-overview-home', params],
    params,
  });

  const s = data?.summary;
  const com = data?.commission;

  return (
    <div className='h-full overflow-auto p-6 pb-24 space-y-6'>
      <div className='flex items-center justify-between gap-3'>
        <h1 className='text-lg font-semibold text-gray-900'>At-a-glance</h1>
        <Link
          to='/affiliate/reports'
          className='text-xs font-medium text-primary hover:text-primary-dark'
        >
          View full reports →
        </Link>
      </div>

      {/* Date filter */}
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
            type='date'
            value={customRange?.from ?? period.from}
            onChange={(e) => setCustomRange((r) => ({ from: e.target.value, to: r?.to ?? period.to }))}
            className='bg-white text-gray-700 text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary shadow-sm'
          />
          <span className='text-gray-600 text-sm'>→</span>
          <input
            type='date'
            value={customRange?.to ?? period.to}
            onChange={(e) => setCustomRange((r) => ({ from: r?.from ?? period.from, to: e.target.value }))}
            className='bg-white text-gray-700 text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary shadow-sm'
          />
          <select
            value={forAffiliateId}
            onChange={(e) => setForAffiliateId(e.target.value)}
            className='bg-white text-gray-700 text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary shadow-sm'
            aria-label='Affiliate scope'
          >
            <option value=''>My network (subtree)</option>
            <option value={callerId}>Just my players</option>
            {subs.length > 0 && (
              <optgroup label='Sub-affiliates'>
                {subs.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name || s.username || s.email}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
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
                Registrations
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
                No activity in the selected range. Share your referral links to start
                tracking.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
