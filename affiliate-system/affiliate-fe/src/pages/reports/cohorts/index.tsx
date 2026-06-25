import { useMemo, useState } from 'react';
import { useBaseQuery } from 'api/core/useBaseQuery';
import { REPORTS_API_URLS } from 'config/apiUrls';

interface Cell { offset: number; players: number; retentionPct: number; ngrCents: number }
interface Cohort { cohort: string; size: number; cells: Cell[] }
interface CohortsResponse { months: number; cohorts: Cohort[] }

type Metric = 'retention' | 'ngr';

function eur(cents: number) {
  return `€${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

// Retention % → violet heat background.
function heat(pct: number) {
  if (pct <= 0) return 'transparent';
  const a = Math.min(0.12 + (pct / 100) * 0.78, 0.9);
  return `rgba(124, 58, 237, ${a})`;
}

export default function CohortsReport() {
  const [months, setMonths] = useState(12);
  const [metric, setMetric] = useState<Metric>('retention');

  const params = useMemo(() => ({ months }), [months]);
  const { data, isLoading } = useBaseQuery<CohortsResponse>({
    endpoint: REPORTS_API_URLS.COHORTS(),
    queryKey: ['cohorts', params],
    params,
  });

  const cohorts = data?.cohorts ?? [];
  const offsets = useMemo(() => Array.from({ length: months }, (_, i) => i), [months]);

  const cellFor = (c: Cohort, offset: number) => c.cells.find((x) => x.offset === offset);

  return (
    <div className='h-full overflow-auto p-6 pb-24 space-y-5'>
      <div className='flex items-center justify-between gap-3 flex-wrap'>
        <div>
          <h1 className='text-xl font-semibold text-gray-800'>Cohort retention</h1>
          <p className='text-xs text-gray-600 mt-1'>
            Players grouped by their FTD month, tracked across months since acquisition.
            M0 = acquisition month. Cells show {metric === 'retention' ? 'the % of the cohort still active' : 'NGR generated'} that month.
          </p>
        </div>
        <div className='flex items-center gap-2'>
          <div className='flex rounded-lg border border-gray-200 overflow-hidden text-xs'>
            {(['retention', 'ngr'] as Metric[]).map((m) => (
              <button key={m} onClick={() => setMetric(m)}
                className={`px-3 py-1.5 font-medium ${metric === m ? 'bg-primary text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                {m === 'retention' ? 'Retention %' : 'NGR'}
              </button>
            ))}
          </div>
          <select value={months} onChange={(e) => setMonths(Number(e.target.value))}
            className='bg-white text-gray-700 text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary shadow-sm'>
            {[6, 12, 18, 24].map((n) => <option key={n} value={n}>{n} months</option>)}
          </select>
        </div>
      </div>

      <div className='bg-white rounded-xl border border-gray-100 overflow-auto'>
        {isLoading ? (
          <p className='p-6 text-sm text-gray-600'>Loading…</p>
        ) : cohorts.length === 0 ? (
          <p className='p-6 text-sm text-gray-600'>No cohort data yet.</p>
        ) : (
          <table className='text-xs border-collapse'>
            <thead>
              <tr className='bg-gray-50 text-gray-600'>
                <th className='px-3 py-2 text-left font-semibold sticky left-0 bg-gray-50 z-10'>Cohort</th>
                <th className='px-3 py-2 text-right font-semibold'>Players</th>
                {offsets.map((o) => (
                  <th key={o} className='px-3 py-2 text-center font-semibold whitespace-nowrap'>M{o}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cohorts.map((c) => (
                <tr key={c.cohort} className='border-t border-gray-50'>
                  <td className='px-3 py-2 font-medium text-gray-800 whitespace-nowrap sticky left-0 bg-white z-10'>{c.cohort}</td>
                  <td className='px-3 py-2 text-right text-gray-700'>{c.size}</td>
                  {offsets.map((o) => {
                    const cell = cellFor(c, o);
                    if (!cell) return <td key={o} className='px-3 py-2 text-center text-gray-300'>·</td>;
                    if (metric === 'retention') {
                      return (
                        <td key={o} className='px-3 py-2 text-center text-gray-800' style={{ background: heat(cell.retentionPct) }}>
                          {cell.retentionPct}%
                        </td>
                      );
                    }
                    return (
                      <td key={o} className='px-3 py-2 text-center text-gray-700 whitespace-nowrap'>{eur(cell.ngrCents)}</td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
