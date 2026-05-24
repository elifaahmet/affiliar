import { useState, useEffect, useCallback } from 'react';
import { useBaseQuery } from 'api/core/useBaseQuery';
import { useBaseMutation } from 'api/core/useBaseMutation';
import { OPERATOR_API_URLS, AFFILIATES_API_URLS, BILLING_API_URLS } from 'config/apiUrls';
import PlanBadge from '@components/core-components/PlanBadge';
import { useQueryClient } from '@tanstack/react-query';

interface PlanLimits {
  name: string;
  maxAffiliates: number;
  commissionTypes: string[];
  subAffiliates: boolean;
  campaignTracking: boolean;
}

interface PlanResponse {
  plan: string;
  limits: PlanLimits;
}

interface AffiliatesResponse {
  affiliates: unknown[];
  total: number;
}

interface BillingTransaction {
  _id: string;
  plan: string;
  // Backend writes `amountUsd` (see models/BillingTransaction.js). Older
  // records on disk may have `amount` from a pre-rename payload; keep
  // both as optional so formatUsd can fall through gracefully.
  amountUsd?: number;
  amount?: number;
  status: string;
  createdAt: string;
  transactionId?: string;
}

interface BillingStatus {
  plan: string;
  billingStatus: 'trial' | 'active' | 'past_due' | 'cancelled';
  trialEndsAt: string | null;
  nextBillingDate: string | null;
  billingCycle: string;
  transactions: BillingTransaction[];
}

interface PayResponse {
  transaction: BillingTransaction;
  paymentUrl: string;
  qrCode: string;
  address: string;
}

const PLANS = [
  { key: 'tier1',  label: '1-Tier',            price: 53 },
  { key: 'tier2',  label: '1-Tier & 2-Tier',   price: 98 },
  { key: 'plus',   label: 'Affiliate Plus',    price: 494 },
  { key: 'plusL2', label: 'Affiliate Plus L2', price: 998 },
  { key: 'pro',    label: 'Affiliate Pro',     price: 1799 },
] as const;

const STATUS_BADGE: Record<string, string> = {
  trial: 'bg-violet-100 text-violet-700',
  active: 'bg-green-100 text-green-700',
  past_due: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-700',
};

const TX_STATUS_BADGE: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  paid: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  expired: 'bg-gray-100 text-gray-700',
};

function FeatureRow({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <div className='flex items-center justify-between py-2'>
      <span className='text-sm text-gray-700'>{label}</span>
      {enabled ? (
        <span className='text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded'>Available</span>
      ) : (
        <span className='text-xs font-medium text-gray-700 bg-gray-100 px-2 py-0.5 rounded'>Locked</span>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = status || 'trial';
  const cls = STATUS_BADGE[s] ?? 'bg-gray-100 text-gray-700';
  const label = s.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

function TxStatusBadge({ status }: { status: string }) {
  const cls = TX_STATUS_BADGE[status] ?? 'bg-gray-100 text-gray-700';
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

function daysUntil(dateStr: string): number {
  const now = new Date();
  const target = new Date(dateStr);
  const diff = target.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatUsd(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(amount)) return '—';
  return `$${Number(amount).toLocaleString('en-US')}`;
}

/* ── Payment Modal ─────────────────────────────────────────────────── */

function PaymentModal({
  payData,
  onClose,
}: {
  payData: PayResponse;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [paid, setPaid] = useState(false);

  const checkStatus = useCallback(async () => {
    try {
      await queryClient.invalidateQueries({ queryKey: ['billing-status'] });
      const data = queryClient.getQueryData<BillingStatus>(['billing-status']);
      if (data?.billingStatus === 'active') {
        setPaid(true);
      }
    } catch {
      // ignore polling errors
    }
  }, [queryClient]);

  useEffect(() => {
    if (paid) return;
    const interval = setInterval(checkStatus, 10000);
    return () => clearInterval(interval);
  }, [paid, checkStatus]);

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/40'>
      <div className='bg-white rounded-xl shadow-lg p-6 w-full max-w-md space-y-4'>
        <div className='flex items-center justify-between'>
          <h3 className='text-sm font-semibold text-gray-800'>Complete Payment</h3>
          <button
            onClick={onClose}
            className='text-gray-600 hover:text-gray-600 text-xs'
          >
            Close
          </button>
        </div>

        {paid ? (
          <div className='text-center py-6 space-y-2'>
            <div className='text-green-600 text-3xl font-bold'>&#10003;</div>
            <p className='text-sm font-medium text-green-700'>Payment confirmed</p>
            <p className='text-xs text-gray-700'>Your subscription is now active.</p>
          </div>
        ) : (
          <>
            <div className='space-y-3'>
              <div>
                <p className='text-xs text-gray-700'>Amount</p>
                <p className='text-sm font-medium text-gray-800'>
                  {formatUsd(payData.transaction.amountUsd ?? payData.transaction.amount)}
                </p>
              </div>
              <div>
                <p className='text-xs text-gray-700'>Payment Address</p>
                <p className='text-xs font-mono text-gray-700 bg-gray-50 p-2 rounded break-all'>
                  {payData.address}
                </p>
              </div>
              {payData.qrCode && (
                <div>
                  <p className='text-xs text-gray-700'>QR Code Address</p>
                  <p className='text-xs font-mono text-gray-700 bg-gray-50 p-2 rounded break-all'>
                    {payData.qrCode}
                  </p>
                </div>
              )}
              {payData.paymentUrl && (
                <div>
                  <a
                    href={payData.paymentUrl}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline'
                  >
                    Open Payment Page &rarr;
                  </a>
                </div>
              )}
            </div>
            <div className='flex items-center gap-2 pt-2'>
              <span className='inline-block h-2 w-2 rounded-full bg-yellow-400 animate-pulse' />
              <span className='text-xs text-gray-700'>Waiting for payment...</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Main Settings Page ───────────────────────────────────────────── */

export default function Settings() {
  const { data: planData, isLoading } = useBaseQuery<PlanResponse>({
    endpoint: OPERATOR_API_URLS.GET_PLAN(),
    queryKey: ['operator-plan'],
  });

  const { data: affiliatesData } = useBaseQuery<AffiliatesResponse>({
    endpoint: AFFILIATES_API_URLS.LIST(),
    queryKey: ['affiliates-list'],
  });

  const { data: billingData, isLoading: billingLoading } = useBaseQuery<BillingStatus>({
    endpoint: BILLING_API_URLS.STATUS(),
    queryKey: ['billing-status'],
  });

  const { data: txData } = useBaseQuery<BillingTransaction[]>({
    endpoint: BILLING_API_URLS.TRANSACTIONS(),
    queryKey: ['billing-transactions'],
  });

  const payMutation = useBaseMutation<PayResponse, { plan: string }>({
    endpoint: BILLING_API_URLS.PAY(),
    method: 'post',
    invalidateKeys: ['billing-status', 'billing-transactions'],
  });

  const [payModalData, setPayModalData] = useState<PayResponse | null>(null);

  const affiliateCount = affiliatesData?.total ?? 0;
  const transactions = txData ?? billingData?.transactions ?? [];

  function handleSubscribe(plan: string) {
    payMutation.mutate(
      { plan },
      {
        onSuccess: (data) => {
          setPayModalData(data);
        },
      },
    );
  }

  return (
    <div className='h-full overflow-auto p-6 pb-24 space-y-6'>
      <h1 className='text-xl font-semibold text-gray-800'>Settings</h1>

      {isLoading && <p className='text-sm text-gray-600'>Loading plan info...</p>}

      {planData?.limits && (
        <div className='max-w-lg space-y-6'>
          {/* Plan overview */}
          <div className='bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-4'>
            <div className='flex items-center justify-between'>
              <h2 className='text-sm font-semibold text-gray-800'>Current Plan</h2>
              <PlanBadge plan={planData.plan} />
            </div>

            {/* Usage */}
            <div>
              <p className='text-xs text-gray-700 mb-1'>Affiliate Usage</p>
              <div className='flex items-center gap-3'>
                <div className='flex-1 bg-gray-100 rounded-full h-2 overflow-hidden'>
                  <div
                    className='h-full bg-primary rounded-full transition-all'
                    style={{ width: `${Math.min(100, (affiliateCount / planData.limits.maxAffiliates) * 100)}%` }}
                  />
                </div>
                <span className='text-sm font-medium text-gray-700 shrink-0'>
                  {affiliateCount} / {planData.limits.maxAffiliates}
                </span>
              </div>
            </div>

            {/* Features */}
            <div>
              <p className='text-xs text-gray-700 mb-2'>Features</p>
              <div className='divide-y divide-gray-100'>
                <FeatureRow label='RevShare Commission' enabled={planData.limits.commissionTypes.includes('revshare')} />
                <FeatureRow label='CPA Commission' enabled={planData.limits.commissionTypes.includes('cpa')} />
                <FeatureRow label='Hybrid Commission' enabled={planData.limits.commissionTypes.includes('hybrid')} />
                <FeatureRow label='Tiered RevShare' enabled={planData.limits.commissionTypes.includes('tiered_revshare')} />
                <FeatureRow label='Sub-Affiliates' enabled={planData.limits.subAffiliates} />
                <FeatureRow label='Campaign Tracking' enabled={planData.limits.campaignTracking} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Billing Section ──────────────────────────────────────── */}

      <div className='max-w-3xl space-y-6'>
        <h2 className='text-lg font-semibold text-gray-800'>Billing</h2>

        {billingLoading && <p className='text-sm text-gray-600'>Loading billing info...</p>}

        {/* Billing Status Card */}
        {billingData && (
          <div className='bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-4'>
            <div className='flex items-center justify-between'>
              <h3 className='text-sm font-semibold text-gray-800'>Billing Status</h3>
              <div className='flex items-center gap-2'>
                <PlanBadge plan={billingData.plan} />
                <StatusBadge status={billingData.billingStatus} />
              </div>
            </div>

            {billingData.billingStatus === 'trial' && billingData.trialEndsAt && (
              <p className='text-sm text-violet-700 bg-violet-50 px-3 py-2 rounded-lg'>
                Trial ends on {formatDate(billingData.trialEndsAt)} ({daysUntil(billingData.trialEndsAt)} days remaining)
              </p>
            )}

            {billingData.billingStatus === 'active' && billingData.nextBillingDate && (
              (() => {
                const overdue =
                  new Date(billingData.nextBillingDate).getTime() < Date.now();
                return overdue ? (
                  <p className='text-sm font-medium text-red-700 bg-red-50 px-3 py-2 rounded-lg'>
                    Payment overdue — was due {formatDate(billingData.nextBillingDate)}
                  </p>
                ) : (
                  <p className='text-sm text-gray-600'>
                    Next billing date: {formatDate(billingData.nextBillingDate)}
                  </p>
                );
              })()
            )}

            {billingData.billingStatus === 'past_due' && (
              <p className='text-sm text-red-700 bg-red-50 px-3 py-2 rounded-lg'>
                Payment overdue &mdash; your account may be limited
              </p>
            )}
          </div>
        )}

        {/* Plan Selection */}
        <div className='bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-4'>
          <h3 className='text-sm font-semibold text-gray-800'>Plans</h3>
          <div className='grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-4'>
            {PLANS.map((p) => {
              const isCurrent = billingData?.plan?.toLowerCase() === p.key.toLowerCase();
              return (
                <div
                  key={p.key}
                  className={`rounded-xl border-2 p-5 space-y-3 transition-colors ${
                    isCurrent
                      ? 'border-primary bg-primary/5'
                      : 'border-gray-100 hover:border-gray-200'
                  }`}
                >
                  <p className='text-sm font-semibold text-gray-800'>{p.label}</p>
                  <p className='text-2xl font-bold text-gray-900'>
                    {formatUsd(p.price)}
                    <span className='text-xs font-normal text-gray-700'>/mo</span>
                  </p>
                  {isCurrent ? (
                    <span className='inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-700'>
                      Current Plan
                    </span>
                  ) : (
                    <button
                      onClick={() => handleSubscribe(p.key)}
                      disabled={payMutation.isPending}
                      className='w-full px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors'
                    >
                      {billingData?.plan ? 'Change Plan' : 'Subscribe'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {payMutation.isError && (
            <p className='text-xs text-red-600'>
              Payment initiation failed. Please try again.
            </p>
          )}
        </div>

        {/* Transaction History */}
        {transactions.length > 0 && (
          <div className='bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-4'>
            <h3 className='text-sm font-semibold text-gray-800'>Transaction History</h3>
            <div className='overflow-x-auto'>
              <table className='w-full text-left'>
                <thead>
                  <tr className='border-b border-gray-100'>
                    <th className='text-xs font-medium text-gray-700 pb-2 pr-4'>Date</th>
                    <th className='text-xs font-medium text-gray-700 pb-2 pr-4'>Plan</th>
                    <th className='text-xs font-medium text-gray-700 pb-2 pr-4'>Amount</th>
                    <th className='text-xs font-medium text-gray-700 pb-2 pr-4'>Status</th>
                    <th className='text-xs font-medium text-gray-700 pb-2'>Transaction ID</th>
                  </tr>
                </thead>
                <tbody className='divide-y divide-gray-50'>
                  {transactions.map((tx) => (
                    <tr key={tx._id}>
                      <td className='text-xs text-gray-700 py-2 pr-4'>
                        {formatDate(tx.createdAt)}
                      </td>
                      <td className='text-xs text-gray-700 py-2 pr-4'>
                        {tx.plan.charAt(0).toUpperCase() + tx.plan.slice(1)}
                      </td>
                      <td className='text-xs text-gray-700 py-2 pr-4'>
                        {formatUsd(tx.amountUsd ?? tx.amount)}
                      </td>
                      <td className='py-2 pr-4'>
                        <TxStatusBadge status={tx.status} />
                      </td>
                      <td className='text-xs text-gray-700 py-2 font-mono'>
                        {tx.transactionId ?? tx._id}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Payment Modal */}
      {payModalData && (
        <PaymentModal
          payData={payModalData}
          onClose={() => setPayModalData(null)}
        />
      )}
    </div>
  );
}
