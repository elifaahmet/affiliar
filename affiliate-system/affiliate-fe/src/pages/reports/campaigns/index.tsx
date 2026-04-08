import { useState, useMemo } from 'react';
import { useBaseQuery } from 'api/core/useBaseQuery';
import { REPORTS_API_URLS, AFFILIATES_API_URLS, OPERATOR_API_URLS } from 'config/apiUrls';
import UpgradeBanner from '@components/core-components/UpgradeBanner';

interface PlanLimits {
  name: string;
  maxAffiliates: number;
  commissionTypes: string[];
  subAffiliates: boolean;
  campaignTracking: boolean;
}

interface PlanResponse {
  plan: string;
  limits: PlanLimits;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function centsToEur(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function defaultRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    from: from.toISOString().slice(0, 10),
    to: now.toISOString().slice(0, 10),
  };
}

// ── types ────────────────────────────────────────────────────────────────────

interface CampaignRow {
  campaign: string;
  affiliateId: string;
  affiliateCode: string;
  registrations: number;
  ftdCount: number;
  ftdSumCents: number;
  depositsCount: number;
  depositsSumCents: number;
  ggrCents: number;
  ngrCents: number;
  playerCount: number;
}

interface CampaignReportResponse {
  period: { from: string; to: string };
  rows: CampaignRow[];
}

interface Affiliate {
  _id: string;
  affiliateCode: string;
  companyName?: string;
}

interface AffiliatesResponse {
  affiliates: Affiliate[];
}

// ── sub-components ───────────────────────────────────────────────────────────

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={`px-4 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap border-r border-gray-100 last:border-r-0 ${
        right ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </th>
  );
}

function Td({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <td
      className={`px-4 py-3 text-xs text-gray-700 whitespace-nowrap border-r border-gray-100 last:border-r-0 ${
        right ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </td>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className='bg-white rounded-xl p-5 shadow-sm border border-gray-100'>
      <p className='text-xs text-gray-500 mb-1'>{label}</p>
      <p className='text-xl font-semibold text-gray-800'>{value}</p>
    </div>
  );
}

// ── main page ────────────────────────────────────────────────────────────────

export default function CampaignReports() {
  const [dateRange, setDateRange] = useState(defaultRange);
  const [affiliateId, setAffiliateId] = useState('');
  const [campaignFilter, setCampaignFilter] = useState('');

  const { data: planData } = useBaseQuery<PlanResponse>({
    endpoint: OPERATOR_API_URLS.GET_PLAN(),
    queryKey: ['operator-plan'],
  });

  const campaignBlocked = planData && !planData.limits.campaignTracking;

  const { data: affiliatesData } = useBaseQuery<AffiliatesResponse>({
    endpoint: AFFILIATES_API_URLS.LIST(),
    queryKey: ['affiliates-select'],
    enabled: !campaignBlocked,
  });

  const params = useMemo(() => {
    const p: Record<string, string> = {
      from: dateRange.from,
      to: dateRange.to,
    };
    if (affiliateId) p.affiliateId = affiliateId;
    if (campaignFilter.trim()) p.campaign = campaignFilter.trim();
    return p;
  }, [dateRange.from, dateRange.to, affiliateId, campaignFilter]);

  const { data, isLoading, isError } = useBaseQuery<CampaignReportResponse>({
    endpoint: REPORTS_API_URLS.CAMPAIGNS(),
    queryKey: ['reports-campaigns', params],
    params,
    enabled: !campaignBlocked,
  });

  const rows = data?.rows ?? [];

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => ({
        registrations: acc.registrations + r.registrations,
        ftdCount: acc.ftdCount + r.ftdCount,
        depositsSumCents: acc.depositsSumCents + r.depositsSumCents,
        ngrCents: acc.ngrCents + r.ngrCents,
        playerCount: acc.playerCount + r.playerCount,
      }),
      { registrations: 0, ftdCount: 0, depositsSumCents: 0, ngrCents: 0, playerCount: 0 },
    );
  }, [rows]);

  if (campaignBlocked) {
    return (
      <div className='bg-gray-100 h-full overflow-auto p-6 pb-24 space-y-6'>
        <h1 className='text-xl font-semibold text-gray-800'>Campaign Reports</h1>
        <UpgradeBanner
          message={`Campaign tracking is not available on the ${planData.limits.name} plan. Upgrade to access campaign-level reporting.`}
          currentPlan={planData.plan}
          requiredPlan='growth'
        />
      </div>
    );
  }

  return (
    <div className='bg-gray-100 h-full overflow-auto p-6 pb-24 space-y-6'>
      {/* Header + filters */}
      <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
        <h1 className='text-xl font-semibold text-gray-800'>Campaign Reports</h1>

        <div className='flex flex-wrap items-center gap-2'>
          <select
            value={affiliateId}
            onChange={(e) => setAffiliateId(e.target.value)}
            className='bg-white text-gray-700 text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary shadow-sm'
          >
            <option value=''>All Affiliates</option>
            {(affiliatesData?.affiliates ?? []).map((a) => (
              <option key={a._id} value={a._id}>
                {a.affiliateCode}
                {a.companyName ? ` - ${a.companyName}` : ''}
              </option>
            ))}
          </select>

          <input
            type='text'
            placeholder='Filter by campaign...'
            value={campaignFilter}
            onChange={(e) => setCampaignFilter(e.target.value)}
            className='bg-white text-gray-700 text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary shadow-sm w-48'
          />

          <input
            type='date'
            value={dateRange.from}
            onChange={(e) => setDateRange((r) => ({ ...r, from: e.target.value }))}
            className='bg-white text-gray-700 text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary shadow-sm'
          />
          <span className='text-gray-400 text-sm'>&rarr;</span>
          <input
            type='date'
            value={dateRange.to}
            onChange={(e) => setDateRange((r) => ({ ...r, to: e.target.value }))}
            className='bg-white text-gray-700 text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary shadow-sm'
          />
        </div>
      </div>

      {/* Summary KPIs */}
      {rows.length > 0 && (
        <div className='grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4'>
          <KpiCard label='Total NGR' value={`\u20AC${centsToEur(totals.ngrCents)}`} />
          <KpiCard label='Total Deposits' value={`\u20AC${centsToEur(totals.depositsSumCents)}`} />
          <KpiCard label='FTDs' value={String(totals.ftdCount)} />
          <KpiCard label='Registrations' value={String(totals.registrations)} />
          <KpiCard label='Players' value={String(totals.playerCount)} />
        </div>
      )}

      {/* Data table */}
      {isLoading && <p className='text-gray-400 text-sm'>Loading...</p>}
      {isError && <p className='text-red-500 text-sm'>Failed to load campaign data.</p>}

      {!isLoading && !isError && (
        <div className='bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100'>
          <div className='px-5 py-3 border-b border-gray-100 flex items-center justify-between'>
            <p className='text-sm font-medium text-gray-800'>Campaign Performance</p>
            <p className='text-xs text-gray-400'>{rows.length} rows</p>
          </div>
          <div className='overflow-x-auto'>
            <table className='w-full'>
              <thead className='bg-gray-50'>
                <tr>
                  <Th>Campaign</Th>
                  <Th>Affiliate</Th>
                  <Th right>Registrations</Th>
                  <Th right>FTDs</Th>
                  <Th right>Deposits (&euro;)</Th>
                  <Th right>NGR (&euro;)</Th>
                  <Th right>Players</Th>
                </tr>
              </thead>
              <tbody className='divide-y divide-gray-100'>
                {rows.map((row, i) => (
                  <tr
                    key={`${row.campaign}-${row.affiliateId}-${i}`}
                    className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
                  >
                    <Td>
                      <span className='font-mono'>{row.campaign || '\u2014'}</span>
                    </Td>
                    <Td>{row.affiliateCode || row.affiliateId || '\u2014'}</Td>
                    <Td right>{row.registrations}</Td>
                    <Td right>{row.ftdCount}</Td>
                    <Td right>{centsToEur(row.depositsSumCents)}</Td>
                    <Td right>{centsToEur(row.ngrCents)}</Td>
                    <Td right>{row.playerCount}</Td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className='px-3 py-6 text-center text-xs text-gray-400'>
                      No campaign data for the selected period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
