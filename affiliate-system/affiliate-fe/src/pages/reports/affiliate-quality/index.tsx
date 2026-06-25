import { useMemo, useState } from 'react';
import { useBaseQuery } from 'api/core/useBaseQuery';
import { REPORTS_API_URLS } from 'config/apiUrls';

function defaultRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: from.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) };
}

interface QualityRow {
  affiliateId: string;
  affiliate: string;
  affiliateCode: string | null;
  clicks: number;
  registrations: number;
  ftdCount: number;
  ftdRate: number; // %
  ngrCents: number;
  playerCount: number;
  ngrPerPlayerCents: number;
  ltvCents: number;
  fraudCount: number;
  score: number;
}
interface QualityResponse { rows: QualityRow[] }

function eur(cents: number) {
  return `€${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function scoreTone(s: number) {
  if (s >= 70) return 'bg-green-50 text-green-700';
  if (s >= 40) return 'bg-amber-50 text-amber-700';
  return 'bg-red-50 text-red-700';
}

export default function AffiliateQuality() {
  const [range, setRange] = useState(defaultRange());
  const params = useMemo(() => ({ from: range.from, to: range.to }), [range]);

  const { data, isLoading } = useBaseQuery<QualityResponse>({
    endpoint: REPORTS_API_URLS.AFFILIATE_QUALITY(),
    queryKey: ['affiliate-quality', params],
    params,
  });
  const rows = data?.rows ?? [];

  return (
    <div className='h-full overflow-auto p-6 pb-24 space-y-5'>
      <div className='flex items-center justify-between gap-3 flex-wrap'>
        <div>
          <h1 className='text-xl font-semibold text-gray-800'>Affiliate quality</h1>
          <p className='text-xs text-gray-600 mt-1'>
            Who brings value, not just volume. Score = FTD conversion (60%) + lifetime LTV vs €200 (40%),
            minus a fraud penalty. LTV = all-time NGR per acquired player.
          </p>
        </div>
        <div className='flex items-center gap-2'>
          <input type='date' value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
            className='bg-white text-gray-700 text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary shadow-sm' />
          <span className='text-gray-500 text-sm'>→</span>
          <input type='date' value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
            className='bg-white text-gray-700 text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary shadow-sm' />
        </div>
      </div>

      <div className='bg-white rounded-xl border border-gray-100 overflow-hidden'>
        {isLoading ? (
          <p className='p-6 text-sm text-gray-600'>Loading…</p>
        ) : rows.length === 0 ? (
          <p className='p-6 text-sm text-gray-600'>No affiliate activity in this period.</p>
        ) : (
          <div className='overflow-x-auto'>
            <table className='w-full text-sm'>
              <thead className='bg-gray-50'>
                <tr className='text-gray-700'>
                  <th className='px-4 py-2.5 text-left text-xs font-semibold'>Affiliate</th>
                  <th className='px-4 py-2.5 text-right text-xs font-semibold'>Score</th>
                  <th className='px-4 py-2.5 text-right text-xs font-semibold'>Clicks</th>
                  <th className='px-4 py-2.5 text-right text-xs font-semibold'>Regs</th>
                  <th className='px-4 py-2.5 text-right text-xs font-semibold'>FTDs</th>
                  <th className='px-4 py-2.5 text-right text-xs font-semibold'>FTD %</th>
                  <th className='px-4 py-2.5 text-right text-xs font-semibold'>NGR</th>
                  <th className='px-4 py-2.5 text-right text-xs font-semibold'>NGR/player</th>
                  <th className='px-4 py-2.5 text-right text-xs font-semibold'>LTV</th>
                  <th className='px-4 py-2.5 text-right text-xs font-semibold'>Fraud</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-gray-100'>
                {rows.map((r) => (
                  <tr key={r.affiliateId}>
                    <td className='px-4 py-2.5 text-xs text-gray-800'>
                      {r.affiliate}{r.affiliateCode && <span className='text-gray-400'> · {r.affiliateCode}</span>}
                    </td>
                    <td className='px-4 py-2.5 text-right'>
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${scoreTone(r.score)}`}>{r.score}</span>
                    </td>
                    <td className='px-4 py-2.5 text-right text-xs text-gray-700'>{r.clicks}</td>
                    <td className='px-4 py-2.5 text-right text-xs text-gray-700'>{r.registrations}</td>
                    <td className='px-4 py-2.5 text-right text-xs text-gray-700'>{r.ftdCount}</td>
                    <td className='px-4 py-2.5 text-right text-xs text-gray-700'>{r.ftdRate}%</td>
                    <td className='px-4 py-2.5 text-right text-xs text-gray-700'>{eur(r.ngrCents)}</td>
                    <td className='px-4 py-2.5 text-right text-xs text-gray-700'>{eur(r.ngrPerPlayerCents)}</td>
                    <td className='px-4 py-2.5 text-right text-xs font-semibold text-gray-900'>{eur(r.ltvCents)}</td>
                    <td className='px-4 py-2.5 text-right text-xs'>
                      {r.fraudCount > 0
                        ? <span className='inline-flex px-2 py-0.5 rounded text-[11px] font-medium bg-red-50 text-red-700'>{r.fraudCount}</span>
                        : <span className='text-gray-400'>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
