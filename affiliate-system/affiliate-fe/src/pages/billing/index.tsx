import { useState } from 'react';
import { useBaseQuery } from 'api/core/useBaseQuery';
import { useBaseMutation } from 'api/core/useBaseMutation';
import { BILLING_API_URLS } from 'config/apiUrls';

/* ── Types ──────────────────────────────────────────────────────────── */

interface BillingStatus {
  plan: string;
  billingStatus: 'trial' | 'active' | 'past_due' | 'cancelled';
  trialEndsAt: string | null;
  nextBillingDate: string | null;
  billingCycle: string;
}

interface PayResponse {
  transaction: { _id: string; plan: string; amountUsd: number; referenceId: string };
  paymentUrl: string;
  qrCode: string;
  address: string;
}

/* ── Plan catalogue (mirrors affiliate-be/utils/planLimits.js) ──────────
   Feature copy is marketing content and intentionally lives here so the
   pricing page reads well without an extra endpoint. The keys/prices must
   stay in sync with planLimits.js. */

interface PlanCard {
  key: string;
  name: string;
  price: number;
  tagline: string;
  note: string;
  features: string[];
  highlight?: boolean;
}

const PLAN_CARDS: PlanCard[] = [
  {
    key: 'tier1',
    name: '1-Tier',
    price: 47,
    tagline: 'Direct referrals only',
    note: '1-tier referral tracking — no sub-affiliates per affiliate.',
    features: [
      'DIY guided setup',
      'Getting started guide',
      'FAQ & basic email support',
      'Bonus: Fast-track 7-day guide',
    ],
  },
  {
    key: 'tier2',
    name: '1-Tier & 2-Tier',
    price: 97,
    tagline: '2-Level Affiliates',
    note: '2-tier referral tracking — sub-affiliates per affiliate.',
    highlight: true,
    features: [
      'DIY guided setup',
      'Getting started guide',
      'FAQ & basic email support',
      'Bonus: Fast-track 7-day guide',
      'Sub-affiliates & campaign tracking',
    ],
  },
  {
    key: 'plus',
    name: 'Affiliate Plus',
    price: 497,
    tagline: 'DWY Co-managed · Level 1',
    note: '1-Tier & 2-Tier + done-with-you co-management.',
    features: [
      'Everything in 2-Tier',
      'Bonus: 1-on-1 call with the Founder',
      'The Affiliate Engine playbook',
      'Coaching to source 25 affiliates',
    ],
  },
  {
    key: 'plusL2',
    name: 'Affiliate Plus L2',
    price: 997,
    tagline: 'DWY Co-managed · Level 2',
    note: '1-Tier & 2-Tier + deeper co-management.',
    features: [
      'Everything in Affiliate Plus',
      'Bonus: 1-on-1 call with the Founder',
      'The Affiliate Engine playbook',
      'Coaching to source 50 affiliates',
    ],
  },
  {
    key: 'pro',
    name: 'Affiliate Pro',
    price: 2000,
    tagline: 'DWY Co-managed · Level 3',
    note: '1-Tier & 2-Tier + full co-management.',
    features: [
      'Everything in Affiliate Plus L2',
      'Bonus: 1-on-1 call with the Founder',
      'The Affiliate Engine playbook',
      'Priority co-managed sourcing',
    ],
  },
];

/* ── Page ───────────────────────────────────────────────────────────── */

export default function Billing() {
  const { data: billing, isLoading } = useBaseQuery<BillingStatus>({
    endpoint: BILLING_API_URLS.STATUS(),
    queryKey: ['billing-status'],
  });

  const payMutation = useBaseMutation<PayResponse, { plan: string }>({
    endpoint: BILLING_API_URLS.PAY(),
    method: 'post',
    invalidateKeys: ['billing-status', 'billing-transactions'],
  });

  const [payData, setPayData] = useState<PayResponse | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const currentPlan = billing?.plan?.toLowerCase() ?? null;

  const subscribe = (planKey: string) => {
    setPendingKey(planKey);
    payMutation.mutate(
      { plan: planKey },
      {
        onSuccess: (data) => setPayData(data),
        onSettled: () => setPendingKey(null),
      },
    );
  };

  return (
    <div className='h-full overflow-auto p-6 pb-24 space-y-6'>
      {/* Header */}
      <div>
        <h1 className='text-xl font-semibold text-gray-800'>Plans &amp; Billing</h1>
        <p className='text-sm text-gray-600 mt-1'>
          Choose a plan and complete payment to activate it. Payment is settled
          in USDT through our provider.
        </p>
      </div>

      {/* Current status */}
      {!isLoading && billing && (
        <div className='rounded-xl border border-gray-100 bg-white px-5 py-3 flex flex-wrap items-center gap-x-6 gap-y-1'>
          <span className='text-sm text-gray-700'>
            Current plan:{' '}
            <b className='text-gray-900'>
              {PLAN_CARDS.find((p) => p.key.toLowerCase() === currentPlan)?.name ??
                billing.plan}
            </b>
          </span>
          <span className='text-sm text-gray-600'>
            Status: <b className='text-gray-800'>{billing.billingStatus}</b>
          </span>
          {billing.nextBillingDate && (
            <span className='text-sm text-gray-600'>
              Next billing:{' '}
              {new Date(billing.nextBillingDate).toLocaleDateString('en-US')}
            </span>
          )}
          {billing.billingStatus === 'trial' && billing.trialEndsAt && (
            <span className='text-sm text-violet-700'>
              Trial ends {new Date(billing.trialEndsAt).toLocaleDateString('en-US')}
            </span>
          )}
        </div>
      )}

      {/* Plan cards */}
      <div className='grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-5'>
        {PLAN_CARDS.map((plan) => {
          const isCurrent = plan.key.toLowerCase() === currentPlan;
          const isPending = pendingKey === plan.key && payMutation.isPending;
          return (
            <div
              key={plan.key}
              className={`relative flex flex-col rounded-2xl border-2 bg-white p-5 transition-colors ${
                isCurrent
                  ? 'border-primary'
                  : plan.highlight
                    ? 'border-primary/40'
                    : 'border-gray-100'
              }`}
            >
              {plan.highlight && !isCurrent && (
                <span className='absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-[11px] font-semibold text-white'>
                  Most popular
                </span>
              )}

              <p className='text-sm font-semibold text-gray-800'>{plan.name}</p>
              <p className='mt-1 text-3xl font-bold text-gray-900'>
                ${plan.price.toLocaleString('en-US')}
                <span className='text-sm font-normal text-gray-500'>/mo</span>
              </p>
              <p className='mt-1 text-xs font-medium text-violet-700'>
                {plan.tagline}
              </p>
              <p className='mt-2 text-xs text-gray-600'>{plan.note}</p>

              <ul className='mt-4 space-y-1.5 flex-1'>
                {plan.features.map((f) => (
                  <li key={f} className='flex gap-2 text-xs text-gray-700'>
                    <span className='text-violet-500'>✓</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <button
                type='button'
                disabled={isCurrent || payMutation.isPending}
                onClick={() => subscribe(plan.key)}
                className={`mt-5 w-full rounded-lg px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-50 ${
                  isCurrent
                    ? 'bg-gray-100 text-gray-600 cursor-default'
                    : 'bg-primary text-white hover:bg-primary-dark'
                }`}
              >
                {isCurrent
                  ? 'Current plan'
                  : isPending
                    ? 'Starting…'
                    : currentPlan
                      ? 'Switch to this plan'
                      : 'Subscribe'}
              </button>
            </div>
          );
        })}
      </div>

      {payMutation.isError && (
        <p className='text-sm text-red-600'>
          Could not start the payment. Please try again.
        </p>
      )}

      {payData && (
        <PaymentModal data={payData} onClose={() => setPayData(null)} />
      )}
    </div>
  );
}

/* ── Payment modal ──────────────────────────────────────────────────── */

function PaymentModal({
  data,
  onClose,
}: {
  data: PayResponse;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copyAddress = () => {
    if (!data.address) return;
    navigator.clipboard.writeText(data.address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div
      className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4'
      onClick={onClose}
    >
      <div
        className='w-full max-w-md rounded-2xl bg-white p-6 space-y-4'
        onClick={(e) => e.stopPropagation()}
      >
        <div className='flex items-start justify-between'>
          <div>
            <h2 className='text-base font-semibold text-gray-800'>
              Complete your payment
            </h2>
            <p className='text-xs text-gray-600 mt-0.5'>
              ${data.transaction.amountUsd?.toLocaleString('en-US')} · USDT ·
              ref {data.transaction.referenceId}
            </p>
          </div>
          <button
            type='button'
            onClick={onClose}
            className='text-gray-400 hover:text-gray-700 text-lg leading-none'
          >
            ✕
          </button>
        </div>

        {data.qrCode && (
          <div className='flex justify-center'>
            <img
              src={data.qrCode}
              alt='Payment QR code'
              className='h-44 w-44 rounded-lg border border-gray-100'
            />
          </div>
        )}

        {data.address && (
          <div className='space-y-1'>
            <p className='text-[11px] font-medium uppercase tracking-wide text-gray-500'>
              Wallet address
            </p>
            <div className='flex items-center gap-2'>
              <code className='flex-1 break-all rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-700'>
                {data.address}
              </code>
              <button
                type='button'
                onClick={copyAddress}
                className='shrink-0 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50'
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        )}

        {data.paymentUrl && (
          <a
            href={data.paymentUrl}
            target='_blank'
            rel='noopener noreferrer'
            className='block w-full rounded-lg bg-primary px-3 py-2 text-center text-sm font-semibold text-white hover:bg-primary-dark'
          >
            Open payment page →
          </a>
        )}

        <p className='text-[11px] text-gray-500'>
          Your plan activates automatically once the provider confirms the
          payment. You can close this window — the transaction is saved under
          Billing.
        </p>
      </div>
    </div>
  );
}
