import { useBaseQuery } from 'api/core/useBaseQuery';
import { AFFILIATE_PORTAL_API_URLS } from 'config/apiUrls';
import PayoutWallet from '@components/core-components/PayoutWallet';

interface AccountStatus {
  operatorName: string | null;
  operatorSuspended: boolean;
  earningsVisible: boolean;
}

interface Balance {
  earnedCents: number;
  paidToMeCents: number;
  paidToMySubsCents: number;
  balanceCents: number;
}

interface Payout {
  _id: string;
  amountCents: number;
  currency: string;
  status: string;
  payoutNetwork: string;
  createdAt: string;
}

function money(cents: number, currency = 'USD') {
  return `${currency} ${(cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

const STATUS_TONE: Record<string, string> = {
  pending:    'bg-gray-100 text-gray-700',
  processing: 'bg-yellow-100 text-yellow-700',
  paid:       'bg-green-100 text-green-700',
  failed:     'bg-red-100 text-red-700',
  cancelled:  'bg-gray-100 text-gray-500',
};

/**
 * Shown to an affiliate whose operator stopped paying for Affiliar.
 *
 * The affiliate did nothing wrong, so this is not a bare "access denied".
 * It names who owes, says plainly that tracking has stopped (otherwise they
 * spend days debugging links that were never broken), and keeps the part
 * that is genuinely theirs — balance, payout history, payout wallet — on
 * screen. Everything else in the portal is 402'd by `billingGate`, so
 * rendering the normal layout underneath would only produce broken pages.
 */
export default function AffiliateSuspendedGate({ children }: { children: React.ReactNode }) {
  const { data: status, isLoading } = useBaseQuery<AccountStatus>({
    endpoint: AFFILIATE_PORTAL_API_URLS.ACCOUNT_STATUS(),
    queryKey: ['affiliate-account-status'],
  });

  const suspended = !!status?.operatorSuspended;

  const { data: balance } = useBaseQuery<Balance>({
    endpoint: AFFILIATE_PORTAL_API_URLS.PAYOUT_BALANCE(),
    queryKey: ['affiliate-payout-balance-suspended'],
    enabled: suspended,
  });

  const { data: payoutData } = useBaseQuery<{ payouts: Payout[] }>({
    endpoint: AFFILIATE_PORTAL_API_URLS.MY_PAYOUTS(),
    queryKey: ['affiliate-payouts-suspended'],
    enabled: suspended,
  });

  // Don't flash the gate while the status call is still in flight, and stay
  // out of the way entirely for operators (the endpoint 403s for them, so
  // `status` is undefined and `suspended` is false).
  if (isLoading || !suspended) return <>{children}</>;

  const who = status?.operatorName || 'Your operator';
  const payouts = payoutData?.payouts ?? [];

  return (
    <div className='h-full overflow-auto bg-gray-50 p-6'>
      <div className='max-w-3xl mx-auto space-y-5'>

        <div className='rounded-xl border border-amber-200 bg-amber-50 p-6'>
          <h1 className='text-base font-semibold text-amber-900'>
            {who} hasn&apos;t paid their Affiliar subscription
          </h1>
          <p className='mt-2 text-sm text-amber-900/80 leading-relaxed'>
            Their account is suspended, so the affiliate panel is closed for now — reports,
            marketing links and new tracking are all paused.
          </p>
          <p className='mt-2 text-sm text-amber-900/80 leading-relaxed'>
            <b>Your links are not broken.</b> While the account is suspended new clicks and
            conversions aren&apos;t being recorded, so there is nothing to fix on your side.
            Commission you already earned is safe and is shown below.
          </p>
          <p className='mt-3 text-xs text-amber-900/70'>
            Please contact {who} directly — once they settle the invoice everything comes back
            automatically, including this panel.
          </p>
        </div>

        <div className='bg-white rounded-xl border border-gray-200 p-6'>
          <h2 className='text-sm font-semibold text-gray-800 mb-4'>Your balance</h2>
          {!balance ? (
            <p className='text-xs text-gray-500'>Loading…</p>
          ) : (
            <div className='grid grid-cols-2 sm:grid-cols-4 gap-4'>
              {[
                { label: 'Earned',        value: balance.earnedCents },
                { label: 'Paid to you',   value: balance.paidToMeCents },
                { label: 'Paid to subs',  value: balance.paidToMySubsCents },
                { label: 'Outstanding',   value: balance.balanceCents, strong: true },
              ].map((s) => (
                <div key={s.label}>
                  <p className='text-[11px] text-gray-500 uppercase tracking-wider'>{s.label}</p>
                  <p className={`mt-0.5 tabular-nums ${
                    s.strong ? 'text-lg font-semibold text-gray-900' : 'text-sm text-gray-700'
                  }`}>
                    {money(s.value)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className='bg-white rounded-xl border border-gray-200 p-6'>
          <h2 className='text-sm font-semibold text-gray-800 mb-4'>Payout history</h2>
          {payouts.length === 0 ? (
            <p className='text-xs text-gray-500'>No payouts yet.</p>
          ) : (
            <div className='overflow-x-auto'>
              <table className='w-full text-sm'>
                <thead>
                  <tr className='text-left text-[11px] uppercase tracking-wider text-gray-500 border-b border-gray-100'>
                    <th className='pb-2 font-medium'>Date</th>
                    <th className='pb-2 font-medium text-right'>Amount</th>
                    <th className='pb-2 font-medium'>Network</th>
                    <th className='pb-2 font-medium'>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {payouts.map((p) => (
                    <tr key={p._id} className='border-b border-gray-50 last:border-0'>
                      <td className='py-2 text-xs text-gray-700'>
                        {new Date(p.createdAt).toLocaleDateString(undefined, {
                          year: 'numeric', month: 'short', day: '2-digit',
                        })}
                      </td>
                      <td className='py-2 text-right tabular-nums font-medium text-gray-900'>
                        {money(p.amountCents, p.currency)}
                      </td>
                      <td className='py-2 text-xs text-gray-600'>{p.payoutNetwork}</td>
                      <td className='py-2'>
                        <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-medium ${
                          STATUS_TONE[p.status] || 'bg-gray-100 text-gray-700'
                        }`}>
                          {p.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Still editable on purpose: a wrong address must be fixable before
            the operator pays and payouts start moving again. */}
        <PayoutWallet />
      </div>
    </div>
  );
}
