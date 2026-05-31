import { Link } from 'react-router-dom';
import { useBaseQuery } from 'api/core/useBaseQuery';
import { PLATFORM_ADMIN_API_URLS } from 'config/apiUrls';

interface OperatorOwner {
  _id: string;
  email: string;
  name: string;
  status: string;
}

interface PlatformOperator {
  _id: string;
  id: number;
  name: string;
  plan: string;
  billingStatus: string;
  nextBillingDate: string | null;
  trialEndsAt: string | null;
  activeDiscountCode: string;
  owners: OperatorOwner[];
  createdAt: string;
}

interface OperatorsResponse {
  operators: PlatformOperator[];
}

const STATUS_STYLES: Record<string, string> = {
  trial:     'bg-violet-50 text-violet-700',
  active:    'bg-green-50 text-green-700',
  past_due:  'bg-yellow-50 text-yellow-800',
  cancelled: 'bg-gray-100 text-gray-600',
};

export default function PlatformOperators() {
  const { data, isLoading, isError } = useBaseQuery<OperatorsResponse>({
    endpoint: PLATFORM_ADMIN_API_URLS.LIST_OPERATORS(),
    queryKey: ['platform-operators'],
  });

  const operators = data?.operators ?? [];

  return (
    <div className='h-full overflow-auto p-6 pb-24 space-y-6'>
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-lg font-semibold text-gray-900'>Platform Admin · Operators</h1>
          <p className='text-xs text-gray-600 mt-0.5'>
            Hexium-internal. Onboard a new operator, see who's on what plan, who's overdue.
          </p>
        </div>
        <Link
          to='/platform/operators/new'
          className='rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark'
        >
          + New operator
        </Link>
      </div>

      <div className='bg-white/80 backdrop-blur-sm rounded-xl border border-violet-100 overflow-hidden'>
        {isLoading && (
          <div className='p-8 text-center text-sm text-gray-600'>Loading…</div>
        )}
        {isError && (
          <div className='p-8 text-center text-sm text-red-500'>Failed to load operators.</div>
        )}
        {!isLoading && !isError && operators.length === 0 && (
          <div className='p-8 text-center text-sm text-gray-600'>
            No operators yet. Use “+ New operator” to onboard the first one.
          </div>
        )}
        {!isLoading && !isError && operators.length > 0 && (
          <div className='overflow-x-auto'>
            <table className='w-full'>
              <thead className='bg-gray-50'>
                <tr>
                  <th className='px-4 py-3 text-left text-xs font-semibold text-gray-700'>Name</th>
                  <th className='px-4 py-3 text-left text-xs font-semibold text-gray-700'>Plan</th>
                  <th className='px-4 py-3 text-left text-xs font-semibold text-gray-700'>Status</th>
                  <th className='px-4 py-3 text-left text-xs font-semibold text-gray-700'>Discount</th>
                  <th className='px-4 py-3 text-left text-xs font-semibold text-gray-700'>Owner</th>
                  <th className='px-4 py-3 text-left text-xs font-semibold text-gray-700'>Next billing</th>
                  <th className='px-4 py-3 text-left text-xs font-semibold text-gray-700'>Created</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-gray-100'>
                {operators.map((op, i) => (
                  <tr key={op._id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className='px-4 py-3 text-xs text-gray-800 font-medium whitespace-nowrap'>
                      {op.name}
                    </td>
                    <td className='px-4 py-3 text-xs text-gray-700 capitalize'>{op.plan}</td>
                    <td className='px-4 py-3'>
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        STATUS_STYLES[op.billingStatus] ?? 'bg-gray-100 text-gray-700'
                      }`}>
                        {op.billingStatus.replace('_', ' ')}
                      </span>
                    </td>
                    <td className='px-4 py-3 text-xs font-mono text-gray-700'>
                      {op.activeDiscountCode || '—'}
                    </td>
                    <td className='px-4 py-3 text-xs text-gray-700'>
                      {op.owners[0]
                        ? <span>{op.owners[0].name} <span className='text-gray-500'>· {op.owners[0].email}</span></span>
                        : <span className='text-gray-500'>—</span>}
                    </td>
                    <td className='px-4 py-3 text-xs text-gray-700'>
                      {op.nextBillingDate
                        ? new Date(op.nextBillingDate).toLocaleDateString('en-GB')
                        : op.trialEndsAt
                          ? <span className='text-violet-700'>Trial · {new Date(op.trialEndsAt).toLocaleDateString('en-GB')}</span>
                          : '—'}
                    </td>
                    <td className='px-4 py-3 text-xs text-gray-700'>
                      {op.createdAt ? new Date(op.createdAt).toLocaleDateString('en-GB') : '—'}
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
