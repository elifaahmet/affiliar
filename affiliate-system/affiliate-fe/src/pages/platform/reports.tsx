import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useBaseQuery } from 'api/core/useBaseQuery';
import { PLATFORM_ADMIN_API_URLS } from 'config/apiUrls';

/* ── Types ──────────────────────────────────────────────────────────── */

interface SummaryRow {
  registrations: number;
  ftdCount: number; ftdSumCents: number;
  depositsCount: number; depositsSumCents: number;
  cashoutsCount: number; cashoutsSumCents: number;
  chargebacksCount: number; chargebacksSumCents: number;
  computedGgrCents: number; computedNgrCents: number;
  sbGgrCents: number; sbNgrCents: number; combinedNgrCents: number;
  bonusIssuesSumCents: number; paymentSystemFeesSumCents: number;
  jackpotFeesSumCents: number; gameProviderFeesSumCents: number;
  casinoTaxesSumCents: number;
  roundsCount: number; wagerCents: number;
  playerCount: number;
  [k: string]: number | string;
}
interface ByDayRow extends SummaryRow { date: string }
type ByOperatorRow = SummaryRow & {
  operatorId: string;
  operator: { _id: string; id: number; name: string } | null;
};

interface OverviewResponse {
  period: { from: string | null; to: string | null };
  productScope: { casino: boolean; sportsbook: boolean };
  summary: SummaryRow;
  byDay: ByDayRow[];
  byOperator: ByOperatorRow[];
}

interface OperatorRow {
  _id: string;
  name: string;
}
interface OperatorsResponse { operators: OperatorRow[] }

interface BrandRow {
  _id: string;
  name: string;
  operator: { _id: string; name: string } | null;
}
interface BrandsResponse { brands: BrandRow[] }

/* ── Page ───────────────────────────────────────────────────────────── */

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export default function PlatformReports() {
  const [from, setFrom] = useState(isoDaysAgo(30));
  const [to, setTo] = useState(isoDaysAgo(0));
  const [operatorId, setOperatorId] = useState('');
  const [brandId, setBrandId] = useState('');

  const operatorsQ = useBaseQuery<OperatorsResponse>({
    endpoint: PLATFORM_ADMIN_API_URLS.LIST_OPERATORS(),
    queryKey: ['platform-operators-picker'],
  });
  const brandsQ = useBaseQuery<BrandsResponse>({
    endpoint: PLATFORM_ADMIN_API_URLS.LIST_ALL_BRANDS(),
    queryKey: ['platform-brands-picker'],
  });

  const overview = useBaseQuery<OverviewResponse>({
    endpoint: PLATFORM_ADMIN_API_URLS.REPORTS_OVERVIEW({
      from, to,
      operatorId: operatorId || undefined,
      brandId: brandId || undefined,
    }),
    queryKey: ['platform-reports-overview', from, to, operatorId, brandId],
  });

  // When an operator is picked, narrow the brand dropdown to that operator's
  // brands; otherwise show every brand across the platform.
  const filteredBrands = useMemo(() => {
    if (!operatorId) return brandsQ.data?.brands ?? [];
    return (brandsQ.data?.brands ?? []).filter((b) => b.operator?._id === operatorId);
  }, [operatorId, brandsQ.data]);

  return (
    <div className='h-full overflow-auto p-6 pb-24 space-y-6'>
      <div>
        <h1 className='text-lg font-semibold text-gray-900'>Platform Admin · Reports</h1>
        <p className='text-xs text-gray-600 mt-0.5'>
          Cross-operator NGR / GGR / deposits over the selected window. Filter
          by operator and brand for drill-down; per-operator breakdown sits
          below.
        </p>
      </div>

      {/* Filters */}
      <div className='bg-white rounded-xl border border-violet-100 p-4 flex flex-wrap items-end gap-3'>
        <Field label='From'>
          <input type='date' value={from} onChange={(e) => setFrom(e.target.value)} className={inputCx} />
        </Field>
        <Field label='To'>
          <input type='date' value={to} onChange={(e) => setTo(e.target.value)} className={inputCx} />
        </Field>
        <Field label='Operator'>
          <select
            value={operatorId}
            onChange={(e) => { setOperatorId(e.target.value); setBrandId(''); }}
            className={inputCx}
          >
            <option value=''>All operators</option>
            {(operatorsQ.data?.operators ?? []).map((o) => (
              <option key={o._id} value={o._id}>{o.name}</option>
            ))}
          </select>
        </Field>
        <Field label='Brand'>
          <select
            value={brandId}
            onChange={(e) => setBrandId(e.target.value)}
            className={inputCx}
            disabled={filteredBrands.length === 0}
          >
            <option value=''>All brands</option>
            {filteredBrands.map((b) => (
              <option key={b._id} value={b._id}>
                {b.name}{!operatorId && b.operator ? ` · ${b.operator.name}` : ''}
              </option>
            ))}
          </select>
        </Field>
        {(operatorId || brandId) && (
          <button
            type='button'
            onClick={() => { setOperatorId(''); setBrandId(''); }}
            className='text-xs text-gray-500 hover:text-gray-700 ml-1'
          >
            Clear filters
          </button>
        )}
      </div>

      {overview.isLoading && (
        <div className='bg-white rounded-xl border border-violet-100 p-8 text-center text-sm text-gray-600'>Loading…</div>
      )}
      {overview.isError && (
        <div className='bg-white rounded-xl border border-red-200 p-8 text-center text-sm text-red-600'>Failed to load reports.</div>
      )}

      {!overview.isLoading && !overview.isError && overview.data && (
        <>
          {/* Summary tiles — product-scoped sections hidden when neither
              brand in scope offers that product. */}
          <div className='grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3'>
            <Tile label='Registrations'   value={fmtCount(overview.data.summary.registrations)} />
            <Tile label='FTDs'            value={fmtCount(overview.data.summary.ftdCount)} sub={fmtMoney(overview.data.summary.ftdSumCents)} />
            <Tile label='Deposits'        value={fmtMoney(overview.data.summary.depositsSumCents)} sub={`${fmtCount(overview.data.summary.depositsCount)} txns`} />
            <Tile label='Cashouts'        value={fmtMoney(overview.data.summary.cashoutsSumCents)} sub={`${fmtCount(overview.data.summary.cashoutsCount)} txns`} />
            {overview.data.productScope.casino && (
              <>
                <Tile label='Casino GGR'  value={fmtMoney(overview.data.summary.computedGgrCents)} />
                <Tile label='Casino NGR'  value={fmtMoney(overview.data.summary.computedNgrCents)} highlight />
              </>
            )}
            {overview.data.productScope.sportsbook && (
              <>
                <Tile label='Sportsbook GGR'  value={fmtMoney(overview.data.summary.sbGgrCents)} />
                <Tile label='Sportsbook NGR'  value={fmtMoney(overview.data.summary.sbNgrCents)} highlight />
              </>
            )}
            {overview.data.productScope.casino && overview.data.productScope.sportsbook && (
              <Tile label='Combined NGR'    value={fmtMoney(overview.data.summary.combinedNgrCents)} highlight />
            )}
            <Tile label='Bonus issued'    value={fmtMoney(overview.data.summary.bonusIssuesSumCents)} />
            <Tile label='Chargebacks'     value={fmtMoney(overview.data.summary.chargebacksSumCents)} sub={`${fmtCount(overview.data.summary.chargebacksCount)} txns`} />
            <Tile label='Unique players'  value={fmtCount(overview.data.summary.playerCount)} />
          </div>

          {/* Per-operator breakdown — product-specific columns mirror the
              productScope so casino-only tenants don't render a column of
              zeroes. The "primary" NGR shown is Combined when both
              products are in scope, otherwise the product-specific NGR. */}
          {(() => {
            const showCasino = overview.data.productScope.casino;
            const showSb = overview.data.productScope.sportsbook;
            const showCombined = showCasino && showSb;
            const colCount = 5 + (showCasino ? 1 : 0) + (showSb ? 1 : 0) + (showCombined ? 1 : 0);
            return (
              <section className='space-y-2'>
                <h2 className='text-sm font-semibold text-gray-700 uppercase tracking-wider'>
                  Per-operator breakdown
                </h2>
                <div className='bg-white rounded-xl border border-violet-100 overflow-hidden'>
                  <table className='w-full text-xs'>
                    <thead className='bg-gray-50 text-gray-700 font-semibold'>
                      <tr>
                        <th className='px-3 py-2 text-left'>Operator</th>
                        <th className='px-3 py-2 text-right'>Registrations</th>
                        <th className='px-3 py-2 text-right'>FTDs</th>
                        <th className='px-3 py-2 text-right'>Deposits</th>
                        <th className='px-3 py-2 text-right'>Cashouts</th>
                        {showCasino && <th className='px-3 py-2 text-right'>Casino NGR</th>}
                        {showSb && <th className='px-3 py-2 text-right'>Sportsbook NGR</th>}
                        {showCombined && <th className='px-3 py-2 text-right'>Combined NGR</th>}
                        <th className='px-3 py-2 text-right'>Players</th>
                      </tr>
                    </thead>
                    <tbody className='divide-y divide-gray-100 text-gray-700'>
                      {overview.data.byOperator.length === 0 && (
                        <tr><td colSpan={colCount} className='px-3 py-6 text-center text-gray-500'>No activity in the selected window.</td></tr>
                      )}
                      {overview.data.byOperator.map((row) => (
                        <tr key={row.operatorId || 'unknown'}>
                          <td className='px-3 py-2 font-medium'>
                            {row.operator
                              ? <Link to={`/platform/operators/${row.operator._id}`} className='hover:text-primary hover:underline'>{row.operator.name}</Link>
                              : <span className='text-gray-500 italic'>unknown ({row.operatorId})</span>}
                          </td>
                          <td className='px-3 py-2 text-right'>{fmtCount(row.registrations)}</td>
                          <td className='px-3 py-2 text-right'>{fmtCount(row.ftdCount)}</td>
                          <td className='px-3 py-2 text-right'>{fmtMoney(row.depositsSumCents)}</td>
                          <td className='px-3 py-2 text-right'>{fmtMoney(row.cashoutsSumCents)}</td>
                          {showCasino && <td className='px-3 py-2 text-right'>{fmtMoney(row.computedNgrCents)}</td>}
                          {showSb && <td className='px-3 py-2 text-right'>{fmtMoney(row.sbNgrCents)}</td>}
                          {showCombined && <td className='px-3 py-2 text-right font-semibold'>{fmtMoney(row.combinedNgrCents)}</td>}
                          <td className='px-3 py-2 text-right'>{fmtCount(row.playerCount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })()}

          {/* Daily breakdown */}
          {(() => {
            const showCasino = overview.data.productScope.casino;
            const showSb = overview.data.productScope.sportsbook;
            const showCombined = showCasino && showSb;
            const colCount = 5 + (showCasino ? 1 : 0) + (showSb ? 1 : 0) + (showCombined ? 1 : 0);
            return (
              <section className='space-y-2'>
                <h2 className='text-sm font-semibold text-gray-700 uppercase tracking-wider'>
                  Daily breakdown
                </h2>
                <div className='bg-white rounded-xl border border-violet-100 overflow-hidden'>
                  <table className='w-full text-xs'>
                    <thead className='bg-gray-50 text-gray-700 font-semibold'>
                      <tr>
                        <th className='px-3 py-2 text-left'>Date</th>
                        <th className='px-3 py-2 text-right'>Regs</th>
                        <th className='px-3 py-2 text-right'>FTDs</th>
                        <th className='px-3 py-2 text-right'>Deposits</th>
                        <th className='px-3 py-2 text-right'>Cashouts</th>
                        {showCasino && <th className='px-3 py-2 text-right'>Casino NGR</th>}
                        {showSb && <th className='px-3 py-2 text-right'>SB NGR</th>}
                        {showCombined && <th className='px-3 py-2 text-right'>Combined NGR</th>}
                      </tr>
                    </thead>
                    <tbody className='divide-y divide-gray-100 text-gray-700'>
                      {overview.data.byDay.length === 0 && (
                        <tr><td colSpan={colCount} className='px-3 py-6 text-center text-gray-500'>No daily rows.</td></tr>
                      )}
                      {overview.data.byDay.map((row) => (
                        <tr key={row.date}>
                          <td className='px-3 py-2 font-mono'>{row.date}</td>
                          <td className='px-3 py-2 text-right'>{fmtCount(row.registrations)}</td>
                          <td className='px-3 py-2 text-right'>{fmtCount(row.ftdCount)}</td>
                          <td className='px-3 py-2 text-right'>{fmtMoney(row.depositsSumCents)}</td>
                          <td className='px-3 py-2 text-right'>{fmtMoney(row.cashoutsSumCents)}</td>
                          {showCasino && <td className='px-3 py-2 text-right'>{fmtMoney(row.computedNgrCents)}</td>}
                          {showSb && <td className='px-3 py-2 text-right'>{fmtMoney(row.sbNgrCents)}</td>}
                          {showCombined && <td className='px-3 py-2 text-right font-semibold'>{fmtMoney(row.combinedNgrCents)}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })()}
        </>
      )}
    </div>
  );
}

/* ── Primitives ─────────────────────────────────────────────────────── */

const inputCx =
  'text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary bg-white';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className='block'>
      <span className='block text-xs font-medium text-gray-700 mb-1'>{label}</span>
      {children}
    </label>
  );
}

function Tile({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border bg-white p-4 ${highlight ? 'border-primary/40' : 'border-violet-100'}`}>
      <div className='text-xs text-gray-500'>{label}</div>
      <div className={`text-lg font-semibold ${highlight ? 'text-primary' : 'text-gray-900'}`}>{value}</div>
      {sub && <div className='text-xs text-gray-500 mt-0.5'>{sub}</div>}
    </div>
  );
}

function fmtMoney(cents: number): string {
  const usd = (cents || 0) / 100;
  return usd.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}
function fmtCount(n: number): string {
  return (n || 0).toLocaleString('en-US');
}
