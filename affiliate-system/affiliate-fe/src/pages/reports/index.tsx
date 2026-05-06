import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useBaseQuery } from 'api/core/useBaseQuery';
import { BRANDS_API_URLS, REPORTS_API_URLS } from 'config/apiUrls';
import BSelectWithSearch from '@components/core-components/selectWithInput/BSelectWithSearch';

interface Brand { id: number; name: string; _id: string; }
interface BrandsResponse { brands: Brand[]; }

// ── helpers ───────────────────────────────────────────────────────────────────

function centsToEur(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function defaultRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 7);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

// ── types ─────────────────────────────────────────────────────────────────────

interface MetricSummary {
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
  computedGgrCents: number;
  computedNgrCents: number;
  roundsCount: number;
  playerCount: number;
}

interface OverviewResponse {
  period: { from: string; to: string };
  summary: MetricSummary;
  byDay: Array<{ date: string } & MetricSummary>;
}

interface AffiliateRow extends MetricSummary {
  affiliateId: string;
  affiliateCode: string;
  campaign: string;
}

interface AffiliatesResponse {
  period: { from: string; to: string };
  affiliates: AffiliateRow[];
  total: number;
  page: number;
  limit: number;
}

interface TrafficRow {
  date: string;
  affiliateId: string;
  affiliateCode: string;
  campaign: string;
  subId: string;
  registrations: number;
  ftdCount: number;
  ftdSumCents: number;
  depositsCount: number;
  depositsSumCents: number;
  playerCount: number;
}

interface TrafficResponse {
  period: { from: string; to: string };
  rows: TrafficRow[];
  total: number;
  page: number;
  limit: number;
}

// ── sub-components ────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className='bg-white rounded-xl p-5 shadow-sm border border-gray-100'>
      <p className='text-xs text-gray-500 mb-1'>{label}</p>
      <p className='text-xl font-semibold text-gray-800'>{value}</p>
      {sub && <p className='text-xs text-gray-400 mt-1'>{sub}</p>}
    </div>
  );
}

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

// ── tabs ──────────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'affiliates' | 'traffic';

const TABS: { key: Tab; label: string }[] = [
  { key: 'overview',   label: 'Overview' },
  { key: 'affiliates', label: 'Affiliates' },
  { key: 'traffic',    label: 'Traffic' },
];

// ── Overview tab ──────────────────────────────────────────────────────────────

function OverviewTab({ params }: { params: Record<string, string> }) {
  const { data, isLoading, isError } = useBaseQuery<OverviewResponse>({
    endpoint: REPORTS_API_URLS.OVERVIEW(),
    queryKey: ['reports-overview', params],
    params,
  });

  if (isLoading) return <p className='text-gray-400 text-sm'>Loading...</p>;
  if (isError)   return <p className='text-red-500 text-sm'>Failed to load overview data.</p>;

  const s = data?.summary;

  return (
    <div className='space-y-6'>
      <div className='grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4'>
        <KpiCard label='NGR' value={`€${centsToEur(s?.computedNgrCents ?? 0)}`} />
        <KpiCard label='GGR' value={`€${centsToEur(s?.computedGgrCents ?? 0)}`} />
        <KpiCard label='Deposits' value={`€${centsToEur(s?.depositsSumCents ?? 0)}`} sub={`${s?.depositsCount ?? 0} txns`} />
        <KpiCard label='Cashouts' value={`€${centsToEur(s?.cashoutsSumCents ?? 0)}`} sub={`${s?.cashoutsCount ?? 0} txns`} />
        <KpiCard label='FTDs' value={String(s?.ftdCount ?? 0)} sub={`€${centsToEur(s?.ftdSumCents ?? 0)}`} />
        <KpiCard label='Registrations' value={String(s?.registrations ?? 0)} sub={`${s?.playerCount ?? 0} players`} />
      </div>

      {data && data.byDay.length > 0 && (
        <div className='bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100'>
          <div className='px-5 py-3 border-b border-gray-100'>
            <p className='text-sm font-medium text-gray-800'>Daily Breakdown</p>
          </div>
          <div className='overflow-x-auto'>
            <table className='w-full'>
              <thead className='bg-gray-50'>
                <tr>
                  <Th>Date</Th>
                  <Th right>GGR (€)</Th>
                  <Th right>NGR (€)</Th>
                  <Th right>Deposits (€)</Th>
                  <Th right>FTDs</Th>
                  <Th right>Regs</Th>
                  <Th right>Rounds</Th>
                  <Th right>Players</Th>
                </tr>
              </thead>
              <tbody className='divide-y divide-gray-100'>
                {data.byDay.map((row, i) => (
                  <tr key={row.date} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <Td>{row.date}</Td>
                    <Td right>{centsToEur(row.computedGgrCents)}</Td>
                    <Td right>{centsToEur(row.computedNgrCents)}</Td>
                    <Td right>{centsToEur(row.depositsSumCents)}</Td>
                    <Td right>{row.ftdCount}</Td>
                    <Td right>{row.registrations}</Td>
                    <Td right>{row.roundsCount.toLocaleString()}</Td>
                    <Td right>{row.playerCount}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data && data.byDay.length === 0 && (
        <p className='text-gray-400 text-sm'>No data for the selected period.</p>
      )}
    </div>
  );
}

// ── Affiliates tab ────────────────────────────────────────────────────────────

function AffiliatesTab({ params }: { params: Record<string, string> }) {
  const { data, isLoading, isError } = useBaseQuery<AffiliatesResponse>({
    endpoint: REPORTS_API_URLS.AFFILIATES(),
    queryKey: ['reports-affiliates', params],
    params: { ...params, limit: '100' },
  });

  if (isLoading) return <p className='text-gray-400 text-sm'>Loading...</p>;
  if (isError)   return <p className='text-red-500 text-sm'>Failed to load affiliate data.</p>;

  return (
    <div className='bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100'>
      <div className='px-5 py-3 border-b border-gray-100 flex items-center justify-between'>
        <p className='text-sm font-medium text-gray-800'>Affiliate Performance</p>
        <p className='text-xs text-gray-400'>{data?.total ?? 0} affiliates</p>
      </div>
      <div className='overflow-x-auto'>
        <table className='w-full'>
          <thead className='bg-gray-50'>
            <tr>
              <Th>Affiliate ID</Th>
              <Th>Code</Th>
              <Th>Campaign</Th>
              <Th right>NGR (€)</Th>
              <Th right>GGR (€)</Th>
              <Th right>Deposits (€)</Th>
              <Th right>FTDs</Th>
              <Th right>Regs</Th>
              <Th right>Players</Th>
              <Th right>Rounds</Th>
            </tr>
          </thead>
          <tbody className='divide-y divide-gray-100'>
            {(data?.affiliates ?? []).map((row, i) => (
              <tr key={`${row.affiliateId}-${i}`} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <Td>{row.affiliateId || '—'}</Td>
                <Td>{row.affiliateCode || '—'}</Td>
                <Td>{row.campaign || '—'}</Td>
                <Td right>{centsToEur(row.computedNgrCents)}</Td>
                <Td right>{centsToEur(row.computedGgrCents)}</Td>
                <Td right>{centsToEur(row.depositsSumCents)}</Td>
                <Td right>{row.ftdCount}</Td>
                <Td right>{row.registrations}</Td>
                <Td right>{row.playerCount}</Td>
                <Td right>{row.roundsCount.toLocaleString()}</Td>
              </tr>
            ))}
            {(data?.affiliates ?? []).length === 0 && (
              <tr>
                <td colSpan={10} className='px-3 py-6 text-center text-xs text-gray-400'>
                  No data for the selected period.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Traffic tab ───────────────────────────────────────────────────────────────

function TrafficTab({ params }: { params: Record<string, string> }) {
  const { data, isLoading, isError } = useBaseQuery<TrafficResponse>({
    endpoint: REPORTS_API_URLS.TRAFFIC(),
    queryKey: ['reports-traffic', params],
    params: { ...params, limit: '200' },
  });

  if (isLoading) return <p className='text-gray-400 text-sm'>Loading...</p>;
  if (isError)   return <p className='text-red-500 text-sm'>Failed to load traffic data.</p>;

  return (
    <div className='bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100'>
      <div className='px-5 py-3 border-b border-gray-100 flex items-center justify-between'>
        <p className='text-sm font-medium text-gray-800'>Traffic Breakdown</p>
        <p className='text-xs text-gray-400'>{data?.total ?? 0} rows</p>
      </div>
      <div className='overflow-x-auto'>
        <table className='w-full'>
          <thead className='bg-gray-50'>
            <tr>
              <Th>Date</Th>
              <Th>Affiliate ID</Th>
              <Th>Code</Th>
              <Th>Campaign</Th>
              <Th>Sub ID</Th>
              <Th right>Regs</Th>
              <Th right>FTDs</Th>
              <Th right>FTD Sum (€)</Th>
              <Th right>Deposits</Th>
              <Th right>Deposit Sum (€)</Th>
              <Th right>Players</Th>
            </tr>
          </thead>
          <tbody className='divide-y divide-gray-100'>
            {(data?.rows ?? []).map((row, i) => (
              <tr key={`${row.date}-${row.affiliateId}-${i}`} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <Td>{row.date}</Td>
                <Td>{row.affiliateId || '—'}</Td>
                <Td>{row.affiliateCode || '—'}</Td>
                <Td>{row.campaign || '—'}</Td>
                <Td>{row.subId || '—'}</Td>
                <Td right>{row.registrations}</Td>
                <Td right>{row.ftdCount}</Td>
                <Td right>{centsToEur(row.ftdSumCents)}</Td>
                <Td right>{row.depositsCount}</Td>
                <Td right>{centsToEur(row.depositsSumCents)}</Td>
                <Td right>{row.playerCount}</Td>
              </tr>
            ))}
            {(data?.rows ?? []).length === 0 && (
              <tr>
                <td colSpan={11} className='px-3 py-6 text-center text-xs text-gray-400'>
                  No data for the selected period.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type ProductScope = 'all' | 'casino' | 'sportsbook';

export default function Reports() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [dateRange, setDateRange] = useState(defaultRange);
  const [brandId, setBrandId] = useState<string>('');
  const [product, setProduct] = useState<ProductScope>('all');

  const { data: brandsData } = useBaseQuery<BrandsResponse>({
    endpoint: BRANDS_API_URLS.LIST(),
    queryKey: ['brands'],
  });

  const params = useMemo(
    () => ({
      from: dateRange.from,
      to:   dateRange.to,
      ...(brandId ? { brandId } : {}),
      // `product` isn't consumed server-side yet — the overview endpoint
      // always returns every scope's numbers — but passing it lets child
      // tabs pick the right column set without prop-drilling.
      product,
    }),
    [dateRange.from, dateRange.to, brandId, product],
  );

  return (
    <div className='h-full overflow-auto p-6 pb-24 space-y-6'>
      {/* Header */}
      <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
        <h1 className='text-xl font-semibold text-gray-800'>Reports</h1>

        <div className='flex items-center gap-2'>
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
            value={dateRange.from}
            onChange={(e) => setDateRange((r) => ({ ...r, from: e.target.value }))}
            className='bg-white text-gray-700 text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary shadow-sm'
          />
          <span className='text-gray-400 text-sm'>→</span>
          <input
            type='date'
            value={dateRange.to}
            onChange={(e) => setDateRange((r) => ({ ...r, to: e.target.value }))}
            className='bg-white text-gray-700 text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary shadow-sm'
          />
        </div>
      </div>

      {/* Product scope */}
      <div className='flex gap-1 bg-white p-1 rounded-lg border border-gray-200 shadow-sm w-fit'>
        {(['all', 'casino', 'sportsbook'] as const).map((p) => (
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

      {/* Tabs */}
      <div className='flex gap-1 bg-white p-1 rounded-lg w-full border border-gray-200 shadow-sm'>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-primary text-white'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className='flex justify-end'>
        <Link
          to='/reports/campaigns'
          className='text-sm font-medium text-primary hover:text-primary-dark transition-colors'
        >
          Campaign Reports &rarr;
        </Link>
      </div>

      {activeTab === 'overview'   && <OverviewTab   params={params} />}
      {activeTab === 'affiliates' && <AffiliatesTab params={params} />}
      {activeTab === 'traffic'    && <TrafficTab    params={params} />}
    </div>
  );
}
