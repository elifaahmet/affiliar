import { useState, useMemo } from 'react';
import { useBaseQuery } from 'api/core/useBaseQuery';
import { REPORTS_API_URLS } from 'config/apiUrls';

function defaultRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: from.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) };
}

function pct(n: number, d: number): string {
  if (!d) return '—';
  return `${((n / d) * 100).toFixed(1)}%`;
}

interface ClicksResponse {
  period: { from: string; to: string };
  summary: { total: number; bots: number; human: number; converted: number };
  byCampaign: { campaign: string | null; clicks: number; converted: number }[];
  byCountry: { country: string | null; clicks: number }[];
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className='bg-white rounded-xl p-5 shadow-sm border border-gray-100'>
      <p className='text-xs text-gray-700 mb-1'>{label}</p>
      <p className='text-xl font-semibold text-gray-800'>{value}</p>
      {sub && <p className='text-[11px] text-gray-500 mt-0.5'>{sub}</p>}
    </div>
  );
}

export default function ClicksReport() {
  const [range, setRange] = useState(defaultRange());

  const params = useMemo(() => ({ from: range.from, to: range.to }), [range]);
  const { data, isLoading } = useBaseQuery<ClicksResponse>({
    endpoint: REPORTS_API_URLS.CLICKS(),
    queryKey: ['report-clicks', params],
    params,
  });

  const s = data?.summary;
  const byCampaign = data?.byCampaign ?? [];
  const byCountry = data?.byCountry ?? [];

  return (
    <div className='h-full overflow-auto p-6 pb-24 space-y-5'>
      <div className='flex items-center justify-between gap-3 flex-wrap'>
        <h1 className='text-xl font-semibold text-gray-800'>Clicks</h1>
        <div className='flex items-center gap-2'>
          <input
            type='date'
            value={range.from}
            onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
            className='bg-white text-gray-700 text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary shadow-sm'
          />
          <span className='text-gray-500 text-sm'>→</span>
          <input
            type='date'
            value={range.to}
            onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
            className='bg-white text-gray-700 text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary shadow-sm'
          />
        </div>
      </div>

      {isLoading ? (
        <p className='text-sm text-gray-600'>Loading…</p>
      ) : (
        <>
          <div className='grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4'>
            <KpiCard label='Clicks (human)' value={String(s?.human ?? 0)} sub={`${s?.total ?? 0} total incl. bots`} />
            <KpiCard label='Bots filtered' value={String(s?.bots ?? 0)} sub={`${pct(s?.bots ?? 0, s?.total ?? 0)} of all`} />
            <KpiCard label='Converted' value={String(s?.converted ?? 0)} sub={`${pct(s?.converted ?? 0, s?.human ?? 0)} of clicks`} />
            <KpiCard label='Top campaigns' value={String(byCampaign.length)} sub='by clicks' />
          </div>

          <div className='grid grid-cols-1 lg:grid-cols-2 gap-5'>
            {/* Top campaigns */}
            <div className='bg-white rounded-xl border border-gray-100 overflow-hidden'>
              <p className='px-4 py-3 text-sm font-semibold text-gray-800 border-b border-gray-100'>Top campaigns</p>
              {byCampaign.length === 0 ? (
                <p className='px-4 py-6 text-xs text-gray-500'>No clicks in this period.</p>
              ) : (
                <table className='w-full text-sm'>
                  <thead className='bg-gray-50'>
                    <tr>
                      <th className='px-4 py-2 text-left text-xs font-semibold text-gray-700'>Campaign</th>
                      <th className='px-4 py-2 text-right text-xs font-semibold text-gray-700'>Clicks</th>
                      <th className='px-4 py-2 text-right text-xs font-semibold text-gray-700'>Converted</th>
                      <th className='px-4 py-2 text-right text-xs font-semibold text-gray-700'>CR</th>
                    </tr>
                  </thead>
                  <tbody className='divide-y divide-gray-100'>
                    {byCampaign.map((c, i) => (
                      <tr key={`${c.campaign}-${i}`}>
                        <td className='px-4 py-2 text-xs text-gray-700'>{c.campaign || '— (none)'}</td>
                        <td className='px-4 py-2 text-xs text-gray-700 text-right'>{c.clicks}</td>
                        <td className='px-4 py-2 text-xs text-gray-700 text-right'>{c.converted}</td>
                        <td className='px-4 py-2 text-xs text-gray-700 text-right'>{pct(c.converted, c.clicks)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Top countries */}
            <div className='bg-white rounded-xl border border-gray-100 overflow-hidden'>
              <p className='px-4 py-3 text-sm font-semibold text-gray-800 border-b border-gray-100'>Top countries</p>
              {byCountry.length === 0 ? (
                <p className='px-4 py-6 text-xs text-gray-500'>No clicks in this period.</p>
              ) : (
                <table className='w-full text-sm'>
                  <thead className='bg-gray-50'>
                    <tr>
                      <th className='px-4 py-2 text-left text-xs font-semibold text-gray-700'>Country</th>
                      <th className='px-4 py-2 text-right text-xs font-semibold text-gray-700'>Clicks</th>
                    </tr>
                  </thead>
                  <tbody className='divide-y divide-gray-100'>
                    {byCountry.map((c, i) => (
                      <tr key={`${c.country}-${i}`}>
                        <td className='px-4 py-2 text-xs text-gray-700'>{c.country || '— (unknown)'}</td>
                        <td className='px-4 py-2 text-xs text-gray-700 text-right'>{c.clicks}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
