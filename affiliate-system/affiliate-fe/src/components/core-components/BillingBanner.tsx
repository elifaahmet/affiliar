import { useNavigate, useLocation } from 'react-router-dom';
import { useBaseQuery } from 'api/core/useBaseQuery';
import { BILLING_API_URLS } from 'config/apiUrls';

interface BillingStatusLite {
  plan?: string;
  billingStatus?: 'trial' | 'active' | 'past_due' | 'suspended' | 'cancelled';
  nextBillingDate?: string | null;
  lifetimeFree?: boolean;
}

/**
 * Slim banner the operator dashboard pins above the main content. Behaviour
 * by status:
 *   - 'past_due'                       → red banner with Pay now button
 *   - 'active' + nextBillingDate past  → same red banner (job hasn't flipped yet)
 *   - 'suspended'                      → full-screen blocking overlay
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
  const navigate = useNavigate();
  const location = useLocation();
  // On the billing page itself the operator is already where they pay — the
  // full-screen suspended overlay must NOT cover the wallet picker / payment
  // modal (both z-50). So there we downgrade to the slim, non-blocking banner.
  const onBillingPage = location.pathname.startsWith('/billing');

  if (!data) return null;

  // Lifetime-free operators (e.g. our own Hexora tenant) bypass billing
  // entirely — no banner, no past-due nudge, regardless of status.
  if (data.lifetimeFree) return null;

  const next = data.nextBillingDate ? new Date(data.nextBillingDate) : null;
  const overdueByDate =
    next != null && next.getTime() < Date.now() && data.billingStatus === 'active';
  const suspended = data.billingStatus === 'suspended';
  const pastDue = data.billingStatus === 'past_due' || overdueByDate;
  if (!suspended && !pastDue) return null;

  // Push the operator straight into the renewal flow. /billing reads ?renew=1
  // and auto-triggers the wallet picker for their current plan, so they
  // don't have to find the right card and click Subscribe themselves.
  const onPayNow = () => {
    navigate({ pathname: '/billing', search: '?renew=1' }, { replace: false });
    setTimeout(() => {
      document
        .getElementById('billing-plans')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  };

  if (suspended && !onBillingPage) {
    return (
      <div className='fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4'>
        <div className='max-w-md w-full bg-white rounded-lg shadow-xl border border-red-200 p-6 text-center'>
          <div className='inline-flex items-center justify-center h-12 w-12 rounded-full bg-red-100 text-red-700 text-2xl font-bold mb-3'>!</div>
          <h2 className='text-lg font-semibold text-red-800 mb-1'>Service suspended</h2>
          <p className='text-sm text-gray-700 mb-4'>
            Your subscription
            {next ? (
              <> has been overdue since{' '}
                {next.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
              </>
            ) : null}
            . Operator panel access is paused until payment is received. Your data and affiliates are preserved — paying restores everything.
          </p>
          <button
            type='button'
            onClick={onPayNow}
            className='inline-flex items-center justify-center w-full rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700'
          >
            Pay now to restore access →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className='bg-red-50 border-b border-red-200 px-4 py-2 flex items-center gap-3'>
      <span className='text-sm text-red-800'>
        <b>{suspended ? 'Service suspended.' : 'Payment overdue.'}</b>{' '}
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
        {suspended
          ? 'Complete payment below to restore full access.'
          : 'Pay now to avoid losing access.'}
      </span>
      <button
        type='button'
        onClick={onPayNow}
        className='ml-auto inline-flex items-center rounded-md bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700'
      >
        Pay now →
      </button>
    </div>
  );
}
