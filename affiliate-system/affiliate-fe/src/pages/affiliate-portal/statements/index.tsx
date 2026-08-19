import { useMemo, useState } from 'react';
import { useBaseQuery } from 'api/core/useBaseQuery';
import { AFFILIATE_PORTAL_API_URLS } from 'config/apiUrls';

interface LineItem {
  product: string;
  planName: string;
  planType: string | null;
  ngrCents: number;
  ftdCount: number;
  revshareCents: number;
  cpaCents: number;
  fixedCents: number;
  overrideCents: number;
  totalCents: number;
  status: string;
}
interface Statement {
  invoiceNumber: string;
  period: { year: number; month: number };
  issuedAt: string;
  currency: string;
  payer: { name: string };
  payee: { name: string; email: string; payoutAddress: string | null; payoutNetwork: string | null; payoutCurrency: string | null };
  lineItems: LineItem[];
  subIncome: { totalCents: number; count: number };
  grandTotalCents: number;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function lastMonth() {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

export default function AffiliateStatements() {
  const [sel, setSel] = useState(lastMonth());

  const params = useMemo(() => ({ year: sel.year, month: sel.month }), [sel]);
  const { data, isLoading } = useBaseQuery<Statement>({
    endpoint: AFFILIATE_PORTAL_API_URLS.STATEMENT(),
    queryKey: ['affiliate-statement', params],
    params,
  });

  const cur = data?.currency || 'USD';
  const fmt = (c: number) => `${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur}`;

  // Year/month options: last 24 months.
  const periodOptions = useMemo(() => {
    const out: { year: number; month: number; label: string }[] = [];
    const d = new Date();
    d.setUTCDate(1);
    for (let i = 0; i < 24; i++) {
      out.push({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, label: `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}` });
      d.setUTCMonth(d.getUTCMonth() - 1);
    }
    return out;
  }, []);

  return (
    <div className='h-full overflow-auto p-6 pb-24 space-y-5'>
      <style>{`@media print { body * { visibility: hidden !important; } #invoice, #invoice * { visibility: visible !important; } #invoice { position: absolute; left: 0; top: 0; width: 100%; padding: 0; } }`}</style>

      <div className='flex items-center justify-between gap-3 flex-wrap'>
        <h1 className='text-xl font-semibold text-gray-800'>Commission statements</h1>
        <div className='flex items-center gap-2'>
          <select
            value={`${sel.year}-${sel.month}`}
            onChange={(e) => {
              const [y, m] = e.target.value.split('-').map(Number);
              setSel({ year: y, month: m });
            }}
            className='bg-white text-gray-700 text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary shadow-sm'
          >
            {periodOptions.map((p) => (
              <option key={`${p.year}-${p.month}`} value={`${p.year}-${p.month}`}>{p.label}</option>
            ))}
          </select>
          <button
            onClick={() => window.print()}
            disabled={!data}
            className='px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-white hover:bg-primary-dark disabled:opacity-50'
          >
            Print / Save PDF
          </button>
        </div>
      </div>

      {isLoading ? (
        <p className='text-sm text-gray-600'>Loading…</p>
      ) : !data ? (
        <p className='text-sm text-gray-600'>No statement.</p>
      ) : (
        <div id='invoice' className='bg-white rounded-xl border border-gray-100 p-8 max-w-3xl'>
          {/* Header */}
          <div className='flex items-start justify-between mb-6'>
            <div>
              <h2 className='text-lg font-bold text-gray-900'>Commission statement</h2>
              <p className='text-xs text-gray-500 mt-1'>Self-billed invoice · issued by {data.payer.name}</p>
            </div>
            <div className='text-right text-xs text-gray-600'>
              <p className='font-mono font-semibold text-gray-800'>{data.invoiceNumber}</p>
              <p>{MONTHS[data.period.month - 1]} {data.period.year}</p>
              <p>Issued {new Date(data.issuedAt).toLocaleDateString()}</p>
            </div>
          </div>

          {/* Parties */}
          <div className='grid grid-cols-2 gap-6 mb-6 text-xs'>
            <div>
              <p className='font-semibold text-gray-500 uppercase tracking-wider mb-1'>From (payer)</p>
              <p className='text-gray-800 font-medium'>{data.payer.name}</p>
            </div>
            <div>
              <p className='font-semibold text-gray-500 uppercase tracking-wider mb-1'>To (payee)</p>
              <p className='text-gray-800 font-medium'>{data.payee.name}</p>
              <p className='text-gray-600'>{data.payee.email}</p>
              {data.payee.payoutAddress && (
                <p className='text-gray-500 font-mono text-[11px] mt-0.5 break-all'>
                  {[data.payee.payoutCurrency, data.payee.payoutNetwork].filter(Boolean).join('-')} {data.payee.payoutAddress}
                </p>
              )}
            </div>
          </div>

          {/* Line items */}
          <table className='w-full text-xs mb-4'>
            <thead>
              <tr className='border-b border-gray-200 text-gray-500'>
                <th className='py-2 text-left font-semibold'>Product</th>
                <th className='py-2 text-left font-semibold'>Plan</th>
                <th className='py-2 text-right font-semibold'>NGR</th>
                <th className='py-2 text-right font-semibold'>FTDs</th>
                <th className='py-2 text-right font-semibold'>RevShare</th>
                <th className='py-2 text-right font-semibold'>CPA</th>
                <th className='py-2 text-right font-semibold'>Override</th>
                <th className='py-2 text-right font-semibold'>Total</th>
              </tr>
            </thead>
            <tbody>
              {data.lineItems.length === 0 ? (
                <tr><td colSpan={8} className='py-4 text-center text-gray-500'>No commission for this period.</td></tr>
              ) : data.lineItems.map((l, i) => (
                <tr key={i} className='border-b border-gray-50'>
                  <td className='py-2 capitalize text-gray-700'>{l.product}</td>
                  <td className='py-2 text-gray-700'>{l.planName}</td>
                  <td className='py-2 text-right text-gray-700'>{fmt(l.ngrCents)}</td>
                  <td className='py-2 text-right text-gray-700'>{l.ftdCount}</td>
                  <td className='py-2 text-right text-gray-700'>{fmt(l.revshareCents)}</td>
                  <td className='py-2 text-right text-gray-700'>{fmt(l.cpaCents)}</td>
                  <td className='py-2 text-right text-gray-700'>{fmt(l.overrideCents)}</td>
                  <td className='py-2 text-right font-semibold text-gray-900'>{fmt(l.totalCents)}</td>
                </tr>
              ))}
              {data.subIncome.totalCents > 0 && (
                <tr className='border-b border-gray-50'>
                  <td className='py-2 text-gray-700' colSpan={7}>Sub-affiliate income ({data.subIncome.count} edge{data.subIncome.count === 1 ? '' : 's'})</td>
                  <td className='py-2 text-right font-semibold text-gray-900'>{fmt(data.subIncome.totalCents)}</td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Total */}
          <div className='flex justify-end'>
            <div className='w-56'>
              <div className='flex items-center justify-between border-t-2 border-gray-800 pt-2'>
                <span className='text-sm font-bold text-gray-900'>Total due</span>
                <span className='text-sm font-bold text-gray-900'>{fmt(data.grandTotalCents)}</span>
              </div>
            </div>
          </div>

          <p className='text-[10px] text-gray-400 mt-8'>
            This is a self-billed statement generated on the affiliate&apos;s behalf. Amounts reflect calculated
            commission for the period; payout timing follows the operator&apos;s settlement schedule.
          </p>
        </div>
      )}
    </div>
  );
}
