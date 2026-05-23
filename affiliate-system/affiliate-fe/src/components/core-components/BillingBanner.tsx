import { Link } from 'react-router-dom';
import { useBaseQuery } from 'api/core/useBaseQuery';
import { BILLING_API_URLS } from 'config/apiUrls';

interface BillingStatusLite {
  plan?: string;
  billingStatus?: 'trial' | 'active' | 'past_due' | 'cancelled';
  nextBillingDate?: string | null;
}

/**
 * Slim banner the operator dashboard pins above the main content. Shows
 * only when there's something the operator needs to act on:
 *   - billingStatus === 'past_due'  — the daily job already flipped them
 *   - billingStatus === 'active'    + nextBillingDate is in the past
 *     (the job hasn't run yet — same message, just earlier in the cycle)
 *
 * Auto-hides while the query is loading or for affiliates (the endpoint
 * is operator-scoped and 4xxs for affiliate role, which `useBaseQuery`
 * treats as no data — banner stays hidden).
 */
export default function BillingBanner() {
  const { data } = useBaseQuery<BillingStatusLite>({
    endpoint: BILLING_API_URLS.STATUS(),
    queryKey: ['billing-status'],
  });

  if (!data) return null;

  const next = data.nextBillingDate ? new Date(data.nextBillingDate) : null;
  const overdueByDate =
    next != null && next.getTime() < Date.now() && data.billingStatus === 'active';
  const pastDue = data.billingStatus === 'past_due' || overdueByDate;
  if (!pastDue) return null;

  return (
    <div className='bg-red-50 border-b border-red-200 px-4 py-2 flex items-center gap-3'>
      <span className='text-sm text-red-800'>
        <b>Payment overdue.</b>{' '}
        {next ? (
          <>
            Your subscription was due{' '}
            {next.toLocaleDateString('en-US', {
              year: 'numeric', month: 'short', day: 'numeric',
            })}
            .
          </>
        ) : (
          <>Your subscription needs renewing.</>
        )}{' '}
        Pay now to avoid losing access.
      </span>
      <Link
        to='/billing'
        className='ml-auto inline-flex items-center rounded-md bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700'
      >
        Pay now →
      </Link>
    </div>
  );
}
