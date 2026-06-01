import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useBaseQuery } from 'api/core/useBaseQuery';
import { PLATFORM_ADMIN_API_URLS } from 'config/apiUrls';

interface AffiliateRow {
  _id: string;
  email: string;
  name: string;
  username: string;
  status: string;
  parentAffiliateId: string | null;
  subAffiliateCount: number;
  createdAt: string;
  operator: { _id: string; id: number; name: string } | null;
}

interface AffiliatesResponse {
  page: number;
  limit: number;
  total: number;
  affiliates: AffiliateRow[];
}

interface OperatorPickerRow { _id: string; name: string }
interface OperatorsResponse { operators: OperatorPickerRow[] }

const STATUS_OPTIONS = ['', 'active', 'pending', 'disabled'] as const;
const STATUS_STYLES: Record<string, string> = {
  active: 'bg-green-50 text-green-700',
  pending: 'bg-amber-50 text-amber-800',
  disabled: 'bg-gray-100 text-gray-600',
};

export default function PlatformAffiliates() {
  const [operatorId, setOperatorId] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [appliedQ, setAppliedQ] = useState('');
  const [page, setPage] = useState(1);
  const limit = 50;

  const operatorsQ = useBaseQuery<OperatorsResponse>({
    endpoint: PLATFORM_ADMIN_API_URLS.LIST_OPERATORS(),
    queryKey: ['platform-operators-picker'],
  });

  const { data, isLoading, isError } = useBaseQuery<AffiliatesResponse>({
    endpoint: PLATFORM_ADMIN_API_URLS.LIST_AFFILIATES_ALL({
      operatorId: operatorId || undefined,
      status: status || undefined,
      q: appliedQ || undefined,
      page,
      limit,
    }),
    queryKey: ['platform-affiliates', operatorId, status, appliedQ, page],
  });

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className='h-full overflow-auto p-6 pb-24 space-y-6'>
      <div>
        <h1 className='text-lg font-semibold text-gray-900'>Platform Admin · Affiliates</h1>
        <p className='text-xs text-gray-600 mt-0.5'>
          Every affiliate across every operator. Filter by operator and status; search hits
          email, username and name.
        </p>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); setAppliedQ(search.trim()); setPage(1); }}
        className='bg-white rounded-xl border border-violet-100 p-4 flex flex-wrap items-end gap-3'
      >
        <Field label='Operator'>
          <select value={operatorId} onChange={(e) => { setOperatorId(e.target.value); setPage(1); }} className={inputCx}>
            <option value=''>All operators</option>
            {(operatorsQ.data?.operators ?? []).map((o) => (
              <option key={o._id} value={o._id}>{o.name}</option>
            ))}
          </select>
        </Field>
        <Field label='Status'>
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className={inputCx}>
            {STATUS_OPTIONS.map((s) => (
              <option key={s || 'any'} value={s}>{s || 'Any'}</option>
            ))}
          </select>
        </Field>
        <Field label='Search'>
          <input
            type='search'
            value={search}
            onChange={(e) => { setSearch(e.target.value); if (e.target.value === '') setAppliedQ(''); }}
            placeholder='email, username, name…'
            className={`${inputCx} w-64`}
          />
        </Field>
        <button type='submit' className='rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50'>
          Search
        </button>
        {(operatorId || status || appliedQ) && (
          <button
            type='button'
            onClick={() => { setOperatorId(''); setStatus(''); setSearch(''); setAppliedQ(''); setPage(1); }}
            className='text-xs text-gray-500 hover:text-gray-700'
          >
            Clear
          </button>
        )}
      </form>

      <div className='bg-white rounded-xl border border-violet-100 overflow-hidden'>
        {isLoading && <div className='p-8 text-center text-sm text-gray-600'>Loading…</div>}
        {isError && <div className='p-8 text-center text-sm text-red-600'>Failed to load.</div>}
        {!isLoading && !isError && (
          <>
            <div className='flex items-center justify-between px-4 py-2 border-b border-gray-100 text-xs text-gray-600'>
              <span>{total.toLocaleString('en-US')} affiliate{total === 1 ? '' : 's'} total</span>
              {total > limit && (
                <span>Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)}</span>
              )}
            </div>
            <table className='w-full text-xs'>
              <thead className='bg-gray-50 text-gray-700 font-semibold'>
                <tr>
                  <th className='px-3 py-2 text-left'>Name</th>
                  <th className='px-3 py-2 text-left'>Email</th>
                  <th className='px-3 py-2 text-left'>Username</th>
                  <th className='px-3 py-2 text-left'>Operator</th>
                  <th className='px-3 py-2 text-left'>Status</th>
                  <th className='px-3 py-2 text-left'>Tree</th>
                  <th className='px-3 py-2 text-left'>Joined</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-gray-100 text-gray-700'>
                {data?.affiliates.length === 0 && (
                  <tr><td colSpan={7} className='px-3 py-6 text-center text-gray-500'>No affiliates match the filters.</td></tr>
                )}
                {(data?.affiliates ?? []).map((a) => (
                  <tr key={a._id}>
                    <td className='px-3 py-2 font-medium'>{a.name}</td>
                    <td className='px-3 py-2'>{a.email}</td>
                    <td className='px-3 py-2 font-mono'>{a.username}</td>
                    <td className='px-3 py-2'>
                      {a.operator
                        ? <Link to={`/platform/operators/${a.operator._id}`} className='text-primary hover:underline'>{a.operator.name}</Link>
                        : <span className='text-gray-400'>—</span>}
                    </td>
                    <td className='px-3 py-2'>
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[a.status] ?? 'bg-gray-100 text-gray-700'}`}>
                        {a.status}
                      </span>
                    </td>
                    <td className='px-3 py-2'>
                      {a.parentAffiliateId && <span className='text-gray-500'>sub-aff</span>}
                      {a.subAffiliateCount > 0 && (
                        <span className='ml-1 inline-flex rounded-full bg-violet-50 text-violet-700 px-2 py-0.5'>
                          +{a.subAffiliateCount}
                        </span>
                      )}
                      {!a.parentAffiliateId && a.subAffiliateCount === 0 && <span className='text-gray-400'>—</span>}
                    </td>
                    <td className='px-3 py-2'>{new Date(a.createdAt).toLocaleDateString('en-GB')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {totalPages > 1 && (
              <div className='flex items-center justify-center gap-2 px-4 py-3 border-t border-gray-100 text-xs'>
                <button
                  type='button'
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className='rounded-lg border border-gray-200 px-3 py-1 disabled:opacity-50 hover:bg-gray-50'
                >
                  Prev
                </button>
                <span className='text-gray-600'>Page {page} / {totalPages}</span>
                <button
                  type='button'
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className='rounded-lg border border-gray-200 px-3 py-1 disabled:opacity-50 hover:bg-gray-50'
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

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
