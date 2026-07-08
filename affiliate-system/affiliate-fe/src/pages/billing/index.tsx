import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useBaseQuery } from 'api/core/useBaseQuery';
import { useBaseMutation } from 'api/core/useBaseMutation';
import { BILLING_API_URLS, OPERATOR_API_URLS } from 'config/apiUrls';

/* ── Types ──────────────────────────────────────────────────────────── */

interface BillingStatus {
  plan: string;
  billingStatus: 'trial' | 'active' | 'past_due' | 'suspended' | 'cancelled';
  trialEndsAt: string | null;
  nextBillingDate: string | null;
  billingCycle: string;
  activeDiscountCode?: string;
}

interface PayResponse {
  transaction: { _id: string; plan: string; amountUsd: number; referenceId: string };
  paymentUrl: string;
  qrCode: string;
  address: string;
}

// Shape of a Sans receiving wallet. The provider's response is best-effort
// flexible — we render any field that's there, no schema commitment.
interface SansWallet {
  id?: string;
  walletId?: string;
  address?: string;
  cryptoCurrency?: string;
  currency?: string;
  network?: string;
  chain?: string;
  name?: string;
  label?: string;
  minAmount?: number;
  maxAmount?: number;
}

interface WalletsResponse {
  amount: number;
  planPrice: number;
  discountUsd: number;
  discountCode: string;
  wallets: SansWallet[];
}

interface DiscountResult {
  valid: boolean;
  kind?: 'fixed_usd' | 'fixed_fx';
  code?: string;
  // fixed_usd
  amountUsd?: number;
  // fixed_fx
  baseAmountCents?: number;
  baseCurrency?: string;
  finalAmountUsd?: number;
  fxRate?: number;
  fxDate?: string;
  // Closed list of plan keys the code discounts. Empty / missing = all plans.
  applicablePlans?: string[];
  error?: string;
}

type AppliedDiscount =
  | { kind: 'fixed_usd'; code: string; amountUsd: number; applicablePlans: string[] }
  | {
      kind: 'fixed_fx';
      code: string;
      finalAmountUsd: number;
      baseAmountCents: number;
      baseCurrency: string;
      fxRate: number;
      applicablePlans: string[];
    };

// True when the discount can be applied to this plan key. An empty list
// means "all plans" (the legacy fixed_usd behaviour).
function discountAppliesTo(d: AppliedDiscount, planKey: string): boolean {
  return d.applicablePlans.length === 0 || d.applicablePlans.includes(planKey);
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
    price: 53,
    tagline: 'Up to 10 affiliates · 1 brand',
    note: 'Direct referrals only — get your program off the ground.',
    features: [
      'Up to 10 affiliates · 1 brand',
      'Up to 2,500 monthly active players',
      'Revshare, CPA & fixed commission',
      'Direct referrals — one-at-a-time affiliate add',
      'FAQ & basic email support',
    ],
  },
  {
    key: 'tier2',
    name: '1-Tier & 2-Tier',
    price: 98,
    tagline: 'Up to 50 affiliates · 3 brands',
    note: 'Open up sub-affiliates and the full commission toolkit.',
    features: [
      'Everything in 1-Tier',
      'Up to 50 affiliates · 3 brands',
      'Up to 10,000 monthly active players',
      'Sub-affiliates (2-tier) with revenue cascading',
      'All commission types: revshare, CPA, hybrid, tiered, fixed',
      'Campaign / sub-id tracking',
      'Creative library',
    ],
  },
  {
    key: 'plus',
    name: 'Affiliate Plus',
    price: 494,
    tagline: 'Up to 100 affiliates · 10 brands',
    note: 'Power features for serious operators — DWY co-management.',
    highlight: true,
    features: [
      'Everything in 2-Tier',
      'Up to 100 affiliates · 10 brands',
      'Up to 75,000 monthly active players',
      'Player Bonuses — affiliate-distributed casino bonuses',
      'Player leaderboard (operator + affiliate)',
      'Team members — multi-user operator access',
      'Advanced analytics (cohorts & lifetime value)',
      'Bulk CSV import (provider fees + affiliates)',
      'Custom NGR % + Custom Deposit % deductions',
      'KYC level CPA qualification gate',
      'DWY co-managed sourcing (25 affiliates)',
      '1-on-1 call with the Founder',
    ],
  },
  {
    key: 'plusL2',
    name: 'Affiliate Plus L2',
    price: 998,
    tagline: 'Up to 500 affiliates · 50 brands',
    note: 'Integrations, webhooks, and deeper co-management.',
    features: [
      'Everything in Affiliate Plus',
      'Up to 500 affiliates · 50 brands',
      'Up to 400,000 monthly active players',
      'API access + webhook events',
      'Player bulk import via API',
      'DWY co-managed sourcing (50 affiliates)',
    ],
  },
  {
    key: 'pro',
    name: 'Affiliate Pro',
    price: 1799,
    tagline: 'Unlimited affiliates & brands',
    note: 'White-label everything; priority co-management.',
    features: [
      'Everything in Affiliate Plus L2',
      'Unlimited affiliates · unlimited brands',
      'Millions of monthly active players (fair use)',
      'White-label / custom branding on the portal',
      'Refer-a-Friend program with Crew (tiered) rewards',
      'Anti-abuse signals (IP / device / wallet)',
      'Priority co-managed sourcing',
    ],
  },
];

// Render a base-currency amount the way it'd appear on a contract: €200,
// £150, ₺2,500, $… — the symbol map covers what we serve today. Anything
// else falls back to "200 XYZ".
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', EUR: '€', GBP: '£', TRY: '₺', INR: '₹', JPY: '¥',
};
function formatBase(amountCents: number, currency: string): string {
  const amount = (amountCents / 100).toLocaleString('en-US');
  const sym = CURRENCY_SYMBOLS[currency.toUpperCase()];
  return sym ? `${sym}${amount}` : `${amount} ${currency}`;
}

/* ── Page ───────────────────────────────────────────────────────────── */

export default function Billing() {
  const { data: billing, isLoading } = useBaseQuery<BillingStatus>({
    endpoint: BILLING_API_URLS.STATUS(),
    queryKey: ['billing-status'],
  });

  const { data: usage } = useBaseQuery<{ activePlayers: number; maxPlayers: number | null; over: boolean }>({
    endpoint: OPERATOR_API_URLS.PLAYER_USAGE(),
    queryKey: ['operator-player-usage'],
  });

  const walletsMutation = useBaseMutation<
    WalletsResponse,
    { plan: string; discountCode?: string }
  >({
    endpoint: BILLING_API_URLS.WALLETS(),
    method: 'post',
  });

  const payMutation = useBaseMutation<
    PayResponse,
    {
      plan: string;
      walletId: string;
      cryptoCurrency?: string;
      network?: string;
      address?: string;
      discountCode?: string;
    }
  >({
    endpoint: BILLING_API_URLS.PAY(),
    method: 'post',
    invalidateKeys: ['billing-status', 'billing-transactions'],
  });

  const discountMutation = useBaseMutation<DiscountResult, { code: string }>({
    endpoint: BILLING_API_URLS.DISCOUNT_VALIDATE(),
    method: 'post',
  });

  const [payData, setPayData] = useState<PayResponse | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  // Wallet picker state — open when wallets fetch resolves, keyed by which
  // plan the operator clicked.
  const [pickerData, setPickerData] = useState<
    (WalletsResponse & { plan: string }) | null
  >(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState('');
  const [discount, setDiscount] = useState<AppliedDiscount | null>(null);
  const [discountError, setDiscountError] = useState<string | null>(null);

  const currentPlan = billing?.plan?.toLowerCase() ?? null;
  // Canonical (case-correct) plan key, since `currentPlan` is lowercased
  // for comparisons. We need the canonical for subscribe(planKey).
  const currentPlanKey =
    PLAN_CARDS.find((p) => p.key.toLowerCase() === currentPlan)?.key ?? null;
  // "Needs payment now" — the current plan's button turns into a red Renew.
  // Includes `suspended` (previously omitted, which left a suspended operator
  // with a disabled "Current plan" button and no way to pay).
  const isOverdue =
    !!billing &&
    (billing.billingStatus === 'past_due' ||
      billing.billingStatus === 'suspended' ||
      (billing.billingStatus === 'active' &&
        billing.nextBillingDate != null &&
        new Date(billing.nextBillingDate).getTime() < Date.now()));

  const applyCode = () => {
    const code = codeInput.trim();
    if (!code) return;
    setDiscountError(null);
    discountMutation.mutate(
      { code },
      {
        onSuccess: (r) => {
          if (!r.valid) {
            setDiscount(null);
            setDiscountError(r.error ?? 'Invalid discount code');
            return;
          }
          if (r.kind === 'fixed_fx' && r.finalAmountUsd != null) {
            setDiscount({
              kind: 'fixed_fx',
              code: r.code ?? code.toUpperCase(),
              finalAmountUsd: r.finalAmountUsd,
              baseAmountCents: r.baseAmountCents ?? 0,
              baseCurrency:    r.baseCurrency ?? '',
              fxRate:          r.fxRate ?? 0,
              applicablePlans: r.applicablePlans ?? [],
            });
            setDiscountError(null);
            return;
          }
          if (r.amountUsd != null) {
            setDiscount({
              kind: 'fixed_usd',
              code: r.code ?? code.toUpperCase(),
              amountUsd: r.amountUsd,
              applicablePlans: r.applicablePlans ?? [],
            });
            setDiscountError(null);
            return;
          }
          setDiscount(null);
          setDiscountError(r.error ?? 'Invalid discount code');
        },
        onError: () => {
          setDiscount(null);
          setDiscountError('Could not validate the code');
        },
      },
    );
  };

  const clearCode = () => {
    setDiscount(null);
    setCodeInput('');
    setDiscountError(null);
  };

  // Step 1: open the wallet picker. Asks the BE to fetch Sans's receiving
  // wallets for the net amount of this plan. On success the picker modal
  // takes over; the operator's choice triggers step 2.
  const subscribe = (planKey: string) => {
    setPendingKey(planKey);
    setPickError(null);
    walletsMutation.mutate(
      { plan: planKey, discountCode: discount?.code },
      {
        onSuccess: (data) => setPickerData({ ...data, plan: planKey }),
        onError: (err: any) => {
          setPickError(
            err?.response?.data?.error ??
              'Could not load payment wallets — please try again.',
          );
        },
        onSettled: () => setPendingKey(null),
      },
    );
  };

  // Pre-fill + auto-apply the operator's negotiated discount code (set by
  // billingController when a deal was applied at last checkout). Runs once
  // on first billing load; if the operator removes the code manually we
  // don't keep re-applying.
  const stickyAppliedRef = useRef(false);
  useEffect(() => {
    if (stickyAppliedRef.current) return;
    const code = billing?.activeDiscountCode;
    if (!code) return;
    stickyAppliedRef.current = true;
    setCodeInput(code);
    discountMutation.mutate({ code }, {
      onSuccess: (r) => {
        if (!r.valid) return;
        if (r.kind === 'fixed_fx' && r.finalAmountUsd != null) {
          setDiscount({
            kind: 'fixed_fx',
            code: r.code ?? code,
            finalAmountUsd: r.finalAmountUsd,
            baseAmountCents: r.baseAmountCents ?? 0,
            baseCurrency:    r.baseCurrency ?? '',
            fxRate:          r.fxRate ?? 0,
            applicablePlans: r.applicablePlans ?? [],
          });
        } else if (r.amountUsd != null) {
          setDiscount({
            kind: 'fixed_usd',
            code: r.code ?? code,
            amountUsd: r.amountUsd,
            applicablePlans: r.applicablePlans ?? [],
          });
        }
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billing?.activeDiscountCode]);

  // ?renew=1 from the past-due banner — auto-open the wallet picker for the
  // operator's current plan so they don't have to scroll-find-click.
  const [searchParams, setSearchParams] = useSearchParams();
  const renewTriggeredRef = useRef(false);
  useEffect(() => {
    if (renewTriggeredRef.current) return;
    if (searchParams.get('renew') !== '1') return;
    if (!currentPlanKey) return; // billing data not loaded yet
    if (walletsMutation.isPending || payMutation.isPending || pickerData || payData) return;
    renewTriggeredRef.current = true;
    subscribe(currentPlanKey);
    // Drop the query so refresh doesn't retrigger the flow.
    const next = new URLSearchParams(searchParams);
    next.delete('renew');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, currentPlanKey]);

  // Step 2: operator picked a wallet — actually open the deposit session
  // and show the payment modal. SANS_SESSION_EXPIRED means the token timed
  // out between list and pay; reopening the picker refreshes it.
  const confirmWallet = (wallet: SansWallet) => {
    if (!pickerData) return;
    const walletId = String(wallet.id ?? wallet.walletId ?? '');
    if (!walletId) {
      setPickError('Selected wallet is missing an id.');
      return;
    }
    payMutation.mutate(
      {
        plan: pickerData.plan,
        walletId,
        cryptoCurrency: wallet.cryptoCurrency ?? wallet.currency,
        network: wallet.network ?? wallet.chain,
        address: wallet.address,
        discountCode: discount?.code,
      },
      {
        onSuccess: (data) => {
          setPickerData(null);
          setPayData(data);
        },
        onError: (err: any) => {
          if (err?.response?.data?.errorCode === 'SANS_SESSION_EXPIRED') {
            setPickError('Session expired — close and click Subscribe again to refresh wallets.');
          } else {
            setPickError(
              err?.response?.data?.error ??
                'Could not start the payment — please try again.',
            );
          }
        },
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
          {billing.nextBillingDate &&
            (() => {
              const next = new Date(billing.nextBillingDate);
              const overdue =
                next.getTime() < Date.now() &&
                billing.billingStatus === 'active';
              return overdue ? (
                <span className='text-sm font-medium text-red-700'>
                  Payment overdue — was due{' '}
                  {next.toLocaleDateString('en-US')}
                </span>
              ) : (
                <span className='text-sm text-gray-600'>
                  Next billing: {next.toLocaleDateString('en-US')}
                </span>
              );
            })()}
          {billing.billingStatus === 'trial' && billing.trialEndsAt && (
            <span className='text-sm text-violet-700'>
              Trial ends {new Date(billing.trialEndsAt).toLocaleDateString('en-US')}
            </span>
          )}
          {usage && usage.maxPlayers != null && (
            <span className={`text-sm ${usage.over ? 'text-amber-700 font-medium' : 'text-gray-600'}`}>
              Active players this month:{' '}
              <b className={usage.over ? 'text-amber-800' : 'text-gray-800'}>
                {usage.activePlayers.toLocaleString('en-US')}
              </b>{' '}
              / {usage.maxPlayers.toLocaleString('en-US')}
            </span>
          )}
        </div>
      )}

      {/* Discount code */}
      <div className='rounded-xl border border-violet-100 bg-white px-5 py-4'>
        {discount ? (
          <div className='flex flex-wrap items-center gap-3'>
            <span className='inline-flex items-center gap-1.5 rounded-lg bg-violet-100 px-3 py-1 text-sm font-semibold text-violet-700'>
              {discount.code}
            </span>
            <span className='text-sm text-gray-700'>
              {discount.kind === 'fixed_fx'
                ? (() => {
                    const target = PLAN_CARDS.find(
                      (p) => discount.applicablePlans.includes(p.key),
                    );
                    return `Locked at ${formatBase(discount.baseAmountCents, discount.baseCurrency)} → ≈$${discount.finalAmountUsd.toLocaleString('en-US')}/mo on ${target?.name ?? 'the top plan'} (current FX). Other plans charge list price.`;
                  })()
                : discount.applicablePlans.length === 0
                  ? `−$${discount.amountUsd.toLocaleString('en-US')} applied to every plan below.`
                  : `−$${discount.amountUsd.toLocaleString('en-US')} on ${discount.applicablePlans.join(', ')}.`}
            </span>
            <button
              type='button'
              onClick={clearCode}
              className='ml-auto text-xs font-medium text-gray-500 hover:text-gray-800'
            >
              Remove
            </button>
          </div>
        ) : (
          <div className='flex flex-wrap items-center gap-3'>
            <label className='text-sm font-medium text-gray-700'>
              Have a discount code?
            </label>
            <input
              type='text'
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => { if (e.key === 'Enter') applyCode(); }}
              placeholder='e.g. WELCOME50'
              className='w-44 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-mono uppercase focus:outline-none focus:border-primary'
            />
            <button
              type='button'
              onClick={applyCode}
              disabled={!codeInput.trim() || discountMutation.isPending}
              className='rounded-lg border border-primary px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/5 disabled:opacity-50'
            >
              {discountMutation.isPending ? 'Checking…' : 'Apply'}
            </button>
            {discountError && (
              <span className='text-xs text-red-600'>{discountError}</span>
            )}
          </div>
        )}
      </div>

      {/* Plan cards */}
      <div id='billing-plans' className='grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-5 scroll-mt-24'>
        {PLAN_CARDS.map((plan) => {
          const isCurrent = plan.key.toLowerCase() === currentPlan;
          // Card button reflects step 1 (fetching wallets). Step 2's spinner
          // lives inside the picker modal's Continue button.
          const isPending = pendingKey === plan.key && walletsMutation.isPending;
          // Only apply the discount on plans it actually covers — fixed_fx
          // codes restrict to the top tier (BE: FIXED_FX_PLAN), and
          // applicablePlans on the validate response carries that allow-
          // list. Empty list = applies everywhere (legacy fixed_usd).
          const applies = !!discount && discountAppliesTo(discount, plan.key);
          const netPrice = !applies || !discount
            ? plan.price
            : discount.kind === 'fixed_fx'
              ? discount.finalAmountUsd
              : Math.max(0, plan.price - discount.amountUsd);
          const discounted = applies && netPrice !== plan.price;
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
                ${netPrice.toLocaleString('en-US')}
                <span className='text-sm font-normal text-gray-500'>/mo</span>
              </p>
              {discounted && (
                <p className='text-xs text-gray-500'>
                  <span className='line-through'>
                    ${plan.price.toLocaleString('en-US')}
                  </span>{' '}
                  <span className='text-violet-700 font-medium'>
                    {discount!.kind === 'fixed_fx'
                      ? `flat ${formatBase(discount!.baseAmountCents, discount!.baseCurrency)}`
                      : `−$${discount!.amountUsd.toLocaleString('en-US')}`}
                  </span>
                </p>
              )}
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

              {(() => {
                // Current plan is always payable: red "Renew" when overdue /
                // suspended, otherwise "Make a payment" so the operator can pay
                // ahead of the due date. (The old code disabled the current
                // plan's button when not overdue — the dead-end the banner's
                // Pay now ran into for suspended operators.)
                const isRenewable = isCurrent && isOverdue;
                const isPayAhead = isCurrent && !isOverdue;
                const buttonDisabled =
                  walletsMutation.isPending ||
                  payMutation.isPending ||
                  !!pickerData;
                const buttonClass = isRenewable
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : isPayAhead
                    ? 'border border-primary text-primary hover:bg-primary/5'
                    : 'bg-primary text-white hover:bg-primary-dark';
                const buttonLabel =
                  isPending
                    ? 'Starting…'
                    : isRenewable
                      ? 'Renew →'
                      : isPayAhead
                        ? 'Make a payment'
                        : currentPlan
                          ? 'Switch to this plan'
                          : 'Subscribe';
                return (
                  <button
                    type='button'
                    disabled={buttonDisabled}
                    onClick={() => subscribe(plan.key)}
                    className={`mt-5 w-full rounded-lg px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-50 ${buttonClass}`}
                  >
                    {buttonLabel}
                  </button>
                );
              })()}
            </div>
          );
        })}
      </div>

      {pickError && !pickerData && (
        <p className='text-sm text-red-600'>{pickError}</p>
      )}

      {pickerData && (
        <WalletPickerModal
          data={pickerData}
          submitting={payMutation.isPending}
          error={pickError}
          onPick={confirmWallet}
          onClose={() => { setPickerData(null); setPickError(null); }}
        />
      )}

      {payData && (
        <PaymentModal data={payData} onClose={() => setPayData(null)} />
      )}
    </div>
  );
}

/* ── Wallet picker modal ────────────────────────────────────────────── */

function WalletPickerModal({
  data, submitting, error, onPick, onClose,
}: {
  data: WalletsResponse & { plan: string };
  submitting: boolean;
  error: string | null;
  onPick: (w: SansWallet) => void;
  onClose: () => void;
}) {
  const [chosenIdx, setChosenIdx] = useState<number | null>(null);

  return (
    <div
      className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4'
      onClick={onClose}
    >
      <div
        className='w-full max-w-lg rounded-2xl bg-white p-6 space-y-4 max-h-[90vh] overflow-auto'
        onClick={(e) => e.stopPropagation()}
      >
        <div className='flex items-start justify-between'>
          <div>
            <h2 className='text-base font-semibold text-gray-800'>
              Choose a payment wallet
            </h2>
            <p className='text-xs text-gray-600 mt-0.5'>
              ${data.amount.toLocaleString('en-US')} to pay
              {data.discountUsd > 0 && (
                <> (after −${data.discountUsd.toLocaleString('en-US')} discount)</>
              )}
              {' · '} pick which crypto network you'll send from.
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

        {data.wallets.length === 0 ? (
          <p className='text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-4 text-center'>
            No wallets are currently available for this amount. Please try again
            in a moment.
          </p>
        ) : (
          <ul className='space-y-2'>
            {data.wallets.map((w, idx) => {
              const id = w.id ?? w.walletId ?? `idx-${idx}`;
              const isChosen = chosenIdx === idx;
              const title =
                w.label ??
                w.name ??
                ([w.cryptoCurrency ?? w.currency, w.network ?? w.chain]
                  .filter(Boolean)
                  .join(' · ') || 'Wallet');
              return (
                <li key={String(id)}>
                  <button
                    type='button'
                    onClick={() => setChosenIdx(idx)}
                    className={`w-full text-left rounded-lg border-2 px-3 py-2.5 transition-colors ${
                      isChosen
                        ? 'border-primary bg-primary/5'
                        : 'border-gray-100 hover:border-gray-200'
                    }`}
                  >
                    <p className='text-sm font-semibold text-gray-800'>{title}</p>
                    {w.address && (
                      <p className='text-[11px] font-mono text-gray-500 break-all mt-0.5'>
                        {w.address}
                      </p>
                    )}
                    {(w.minAmount != null || w.maxAmount != null) && (
                      <p className='text-[11px] text-gray-500 mt-0.5'>
                        Range:{' '}
                        {w.minAmount != null ? `$${w.minAmount}` : '—'}
                        {' '}–{' '}
                        {w.maxAmount != null ? `$${w.maxAmount}` : '—'}
                      </p>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {error && <p className='text-xs text-red-600'>{error}</p>}

        <div className='flex justify-end gap-2 pt-2'>
          <button
            type='button'
            onClick={onClose}
            className='rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50'
          >
            Cancel
          </button>
          <button
            type='button'
            disabled={chosenIdx == null || submitting || data.wallets.length === 0}
            onClick={() => chosenIdx != null && onPick(data.wallets[chosenIdx])}
            className='rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50'
          >
            {submitting ? 'Starting…' : 'Continue to payment →'}
          </button>
        </div>
      </div>
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
