import { useState } from 'react';
import { useBaseQuery } from 'api/core/useBaseQuery';
import { useBaseMutation } from 'api/core/useBaseMutation';
import { COMMISSION_API_URLS, OPERATOR_API_URLS } from 'config/apiUrls';
import axiosInstance from 'config/axiosInstance';
import UpgradeBanner from '@components/core-components/UpgradeBanner';

interface PlanLimits {
  name: string;
  maxAffiliates: number;
  commissionTypes: string[];
  subAffiliates: boolean;
  campaignTracking: boolean;
}

interface OperatorPlanResponse {
  plan: string;
  limits: PlanLimits;
}

// ── types ─────────────────────────────────────────────────────────────────────

type PlanType = 'revshare' | 'cpa' | 'hybrid' | 'tiered_revshare';
type ReportStatus = 'draft' | 'pending_approval' | 'approved' | 'paid';

interface Tier { fromCents: number; toCents: number | null; rate: number; }

type ProductScope = 'casino' | 'sportsbook' | 'combined';

interface CommissionPlan {
  _id: string;
  name: string;
  type: PlanType;
  // Which NGR base the plan pays on. Legacy plans default to 'casino'.
  product: ProductScope;
  isDefault: boolean;
  isActive: boolean;
  revshare: {
    // null → inherit from operator default
    metric: 'ngr' | 'ggr' | null;
    rate: number;
    includePaymentFees: boolean | null;
  };
  cpa: {
    amountCents: number;
    currency: string;
    qualification?: {
      depositBasis: 'gross' | 'net' | null;
      minDepositCents: number | null;
      minWagerMultiple: number | null;
      minWagerCents: number | null;
      holdDays: number | null;
      minCashRetentionCents: number | null;
    };
  };
  tiers: Tier[];
  notes: string | null;
}

interface CommissionReport {
  _id: string;
  affiliateId: { _id: string; username: string; email: string } | null;
  affiliateCode: string | null;
  planId: { _id: string; name: string; type: PlanType } | null;
  planSnapshot: any;
  period: { year: number; month: number };
  product?: ProductScope;
  metrics: {
    ggrCents: number; ngrCents: number; ftdCount: number;
    qualifiedFtdCount?: number;
    pendingFtdCount?: number;
    rejectedFtdCount?: number;
    depositsCount: number; depositsCents: number; playerCount: number; registrations: number;
  };
  ftdQualification?: {
    playerId: string;
    ftdDate: string;
    depositCents: number;
    status: 'qualified' | 'pending' | 'rejected';
    reason: string;
  }[];
  breakdown: { revshareAmountCents: number; cpaAmountCents: number; totalCents: number };
  status: ReportStatus;
  calculatedAt: string | null;
  approvedAt: string | null;
  paidAt: string | null;
  notes: string | null;
}

interface ReportsResponse { reports: CommissionReport[]; total: number; }

// ── helpers ───────────────────────────────────────────────────────────────────

function cents(n: number) {
  return `$${(n / 100).toFixed(2)}`;
}

function planTypeLabel(type: PlanType) {
  return { revshare: 'RevShare', cpa: 'CPA', hybrid: 'Hybrid', tiered_revshare: 'Tiered RevShare' }[type] ?? type;
}

function planTypeBadge(type: PlanType) {
  const map: Record<string, string> = {
    revshare:        'bg-violet-100 text-violet-700',
    cpa:             'bg-green-100 text-green-700',
    hybrid:          'bg-fuchsia-100 text-fuchsia-700',
    tiered_revshare: 'bg-warning-light text-warning',
  };
  return `inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${map[type] ?? 'bg-gray-100 text-gray-600'}`;
}

function statusBadge(status: ReportStatus) {
  const map: Record<string, string> = {
    draft:            'bg-gray-100 text-gray-600',
    pending_approval: 'bg-yellow-100 text-yellow-700',
    approved:         'bg-violet-100 text-violet-700',
    paid:             'bg-green-100 text-green-700',
  };
  const labels: Record<string, string> = {
    draft: 'Draft', pending_approval: 'Pending Approval', approved: 'Approved', paid: 'Paid',
  };
  return { cls: `inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${map[status]}`, label: labels[status] ?? status };
}

function planSummary(plan: CommissionPlan) {
  const metric = plan.revshare.metric ? plan.revshare.metric.toUpperCase() : 'NGR (inherit)';
  if (plan.type === 'revshare')        return `${plan.revshare.rate}% of ${metric}`;
  if (plan.type === 'cpa')             return `${cents(plan.cpa.amountCents)} / FTD`;
  if (plan.type === 'hybrid')          return `${plan.revshare.rate}% ${metric} + ${cents(plan.cpa.amountCents)}/FTD`;
  if (plan.type === 'tiered_revshare') return `${plan.tiers.length} tier${plan.tiers.length !== 1 ? 's' : ''}`;
  return '';
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const TABS = ['Plans', 'Reports'] as const;
type Tab = (typeof TABS)[number];

function currentYearMonth() {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

// ── Plan Form Modal ───────────────────────────────────────────────────────────

const EMPTY_PLAN = {
  name: '', type: 'revshare' as PlanType, product: 'casino' as ProductScope, isDefault: false,
  // Null on the nullable fields → the backend inherits from the operator's
  // defaults (configured on the Fees page).
  revshare: {
    metric: null as 'ngr' | 'ggr' | null,
    rate: 30,
    includePaymentFees: null as boolean | null,
  },
  cpa: {
    amountCents: 5000,
    currency: 'USD',
    qualification: {
      depositBasis: null as 'gross' | 'net' | null,
      minDepositCents: null as number | null,
      minWagerMultiple: null as number | null,
      minWagerCents: null as number | null,
      holdDays: null as number | null,
      minCashRetentionCents: null as number | null,
    },
  },
  tiers: [] as Tier[],
  notes: '',
};

function PlanModal({
  plan, onClose, onSaved,
}: { plan?: CommissionPlan; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!plan;
  const [form, setForm] = useState(
    plan
      ? {
          name: plan.name, type: plan.type,
          // Older plans may not have `product` on the document — default to casino.
          product: (plan.product ?? 'casino') as ProductScope,
          isDefault: plan.isDefault,
          // Older plan documents may not have the nullable fields set.
          // Default them to null ("inherit") so the form renders sensibly.
          revshare: {
            metric: plan.revshare?.metric ?? null,
            rate: plan.revshare?.rate ?? 0,
            includePaymentFees: plan.revshare?.includePaymentFees ?? null,
          },
          cpa: {
            amountCents: plan.cpa?.amountCents ?? 0,
            currency: plan.cpa?.currency ?? 'USD',
            qualification: {
              depositBasis:          plan.cpa?.qualification?.depositBasis ?? null,
              minDepositCents:       plan.cpa?.qualification?.minDepositCents ?? null,
              minWagerMultiple:      plan.cpa?.qualification?.minWagerMultiple ?? null,
              minWagerCents:         plan.cpa?.qualification?.minWagerCents ?? null,
              holdDays:              plan.cpa?.qualification?.holdDays ?? null,
              minCashRetentionCents: plan.cpa?.qualification?.minCashRetentionCents ?? null,
            },
          },
          tiers: plan.tiers.map((t) => ({ ...t })),
          notes: plan.notes ?? '',
        }
      : { ...EMPTY_PLAN, revshare: { ...EMPTY_PLAN.revshare }, cpa: { ...EMPTY_PLAN.cpa, qualification: { ...EMPTY_PLAN.cpa.qualification } }, tiers: [] },
  );
  const [error, setError] = useState('');
  const [upgradeBanner, setUpgradeBanner] = useState<{ message: string; currentPlan: string; requiredPlan: string } | null>(null);

  const { data: operatorPlan } = useBaseQuery<OperatorPlanResponse>({
    endpoint: OPERATOR_API_URLS.GET_PLAN(),
    queryKey: ['operator-plan'],
  });

  const allowedTypes = operatorPlan?.limits.commissionTypes ?? ['revshare', 'cpa', 'hybrid', 'tiered_revshare'];

  const { mutate: save, isPending } = useBaseMutation({
    endpoint: isEdit ? COMMISSION_API_URLS.PLAN(plan!._id) : COMMISSION_API_URLS.PLANS(),
    method: isEdit ? 'patch' : 'post',
    onSuccess: () => { setUpgradeBanner(null); onSaved(); onClose(); },
    onError: (e: any) => {
      const respData = e?.response?.data;
      if (respData?.upgrade) {
        setUpgradeBanner({
          message: respData.error,
          currentPlan: respData.currentPlan,
          requiredPlan: respData.requiredPlan,
        });
        setError('');
      } else {
        setUpgradeBanner(null);
        setError(respData?.error ?? e?.message ?? 'Failed to save plan');
      }
    },
  });

  function setField(key: string, val: any) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  function updateQual(key: string, val: number | null) {
    setForm((f) => ({
      ...f,
      cpa: {
        ...f.cpa,
        qualification: { ...(f.cpa.qualification ?? {}), [key]: val },
      },
    }));
  }

  function addTier() {
    const last = form.tiers[form.tiers.length - 1];
    const from = last ? (last.toCents ?? 0) : 0;
    setForm((f) => ({ ...f, tiers: [...f.tiers, { fromCents: from, toCents: null, rate: 30 }] }));
  }

  function updateTier(i: number, key: keyof Tier, val: any) {
    setForm((f) => {
      const tiers = f.tiers.map((t, idx) => idx === i ? { ...t, [key]: val === '' ? null : Number(val) } : t);
      return { ...f, tiers };
    });
  }

  function removeTier(i: number) {
    setForm((f) => ({ ...f, tiers: f.tiers.filter((_, idx) => idx !== i) }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) { setError('Name is required'); return; }
    save({
      ...form,
      revshare: form.revshare,
      cpa: { ...form.cpa, amountCents: Number(form.cpa.amountCents) },
      tiers: form.tiers,
      notes: form.notes || null,
    } as any);
  }

  const showRevshare = ['revshare', 'hybrid'].includes(form.type);
  const showCpa      = ['cpa', 'hybrid'].includes(form.type);
  const showTiers    = form.type === 'tiered_revshare';

  return (
    <div className='fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm overflow-y-auto p-4'>
      <div className='bg-white rounded-xl shadow-xl w-full max-w-lg p-6 space-y-5 m-auto'>
        <h2 className='text-base font-semibold text-gray-800'>{isEdit ? 'Edit Plan' : 'New Commission Plan'}</h2>

        <form onSubmit={handleSubmit} className='space-y-4'>
          {/* Name */}
          <div>
            <label className='block text-xs font-medium text-gray-600 mb-1'>Name</label>
            <input value={form.name} onChange={(e) => setField('name', e.target.value)}
              className='w-full text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary'
              placeholder='e.g. Standard RevShare 30%' />
          </div>

          {/* Product — which NGR base this plan pays on */}
          <div>
            <label className='block text-xs font-medium text-gray-600 mb-1'>Product</label>
            <div className='grid grid-cols-3 gap-2'>
              {(['casino', 'sportsbook', 'combined'] as ProductScope[]).map((p) => (
                <button key={p} type='button'
                  onClick={() => setField('product', p)}
                  className={`py-2 px-3 rounded-lg text-xs font-medium border transition-colors text-left ${
                    form.product === p
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}>
                  <div className='font-semibold capitalize'>{p}</div>
                  <div className='text-gray-600 font-normal mt-0.5 text-[11px]'>
                    {p === 'casino'     && 'Casino NGR only'}
                    {p === 'sportsbook' && 'Sportsbook NGR only'}
                    {p === 'combined'   && 'Casino + sportsbook'}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Type */}
          <div>
            <label className='block text-xs font-medium text-gray-600 mb-1'>Type</label>
            <div className='grid grid-cols-2 gap-2'>
              {(['revshare', 'cpa', 'hybrid', 'tiered_revshare'] as PlanType[]).map((t) => {
                const isAllowed = allowedTypes.includes(t);
                return (
                  <button key={t} type='button'
                    onClick={() => isAllowed && setField('type', t)}
                    disabled={!isAllowed}
                    className={`py-2 px-3 rounded-lg text-xs font-medium border transition-colors text-left ${
                      !isAllowed
                        ? 'border-gray-100 bg-gray-50 text-gray-600 cursor-not-allowed opacity-60'
                        : form.type === t ? 'border-primary bg-primary/5 text-primary' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}>
                    <div className='font-semibold'>
                      {planTypeLabel(t)}
                      {!isAllowed && <span className='ml-1 text-gray-600 font-normal'>(Growth+)</span>}
                    </div>
                    <div className='text-gray-600 font-normal mt-0.5'>
                      {t === 'revshare' && '% of NGR or GGR'}
                      {t === 'cpa' && 'Fixed $ per FTD'}
                      {t === 'hybrid' && 'RevShare + CPA'}
                      {t === 'tiered_revshare' && 'NGR band-based %'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* RevShare config */}
          {showRevshare && (
            <div className='bg-violet-50 rounded-lg p-4 space-y-3'>
              <p className='text-xs font-semibold text-violet-700'>Revenue Share</p>
              <div className='flex gap-3'>
                <div className='flex-1'>
                  <label className='block text-xs text-gray-600 mb-1'>Metric</label>
                  <select
                    value={form.revshare.metric ?? ''}
                    onChange={(e) =>
                      setField('revshare', {
                        ...form.revshare,
                        metric: e.target.value === '' ? null : (e.target.value as 'ngr' | 'ggr'),
                      })
                    }
                    className='w-full text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary bg-white'>
                    <option value=''>Inherit from operator default</option>
                    <option value='ngr'>NGR</option>
                    <option value='ggr'>GGR</option>
                  </select>
                </div>
                <div className='flex-1'>
                  <label className='block text-xs text-gray-600 mb-1'>Rate (%)</label>
                  <input type='number' min={0} max={100} step={0.1}
                    value={form.revshare.rate}
                    onChange={(e) => setField('revshare', { ...form.revshare, rate: Number(e.target.value) })}
                    className='w-full text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary' />
                </div>
              </div>
              <div>
                <label className='block text-xs text-gray-600 mb-1'>NGR includes payment fees</label>
                <select
                  value={form.revshare.includePaymentFees === null ? '' : String(form.revshare.includePaymentFees)}
                  onChange={(e) =>
                    setField('revshare', {
                      ...form.revshare,
                      includePaymentFees: e.target.value === '' ? null : e.target.value === 'true',
                    })
                  }
                  className='w-full text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary bg-white'>
                  <option value=''>Inherit from operator default</option>
                  <option value='true'>Yes — NGR is net of all fees (standard)</option>
                  <option value='false'>No — take share on gross NGR</option>
                </select>
                <p className='text-[11px] text-gray-700 mt-1'>
                  Only meaningful when Metric is NGR. Controls whether
                  deposit/withdrawal/payment-system fees are subtracted before
                  the % is applied.
                </p>
              </div>
            </div>
          )}

          {/* CPA config */}
          {showCpa && (
            <div className='bg-green-50 rounded-lg p-4 space-y-3'>
              <p className='text-xs font-semibold text-green-700'>CPA</p>
              <div className='flex gap-3'>
                <div className='flex-1'>
                  <label className='block text-xs text-gray-600 mb-1'>Amount per FTD ($)</label>
                  <input type='number' min={0} step={1}
                    value={(form.cpa.amountCents / 100).toFixed(2)}
                    onChange={(e) => setField('cpa', { ...form.cpa, amountCents: Math.round(Number(e.target.value) * 100) })}
                    className='w-full text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary' />
                </div>
                <div className='w-28'>
                  <label className='block text-xs text-gray-600 mb-1'>Currency</label>
                  <input value={form.cpa.currency}
                    onChange={(e) => setField('cpa', { ...form.cpa, currency: e.target.value.toUpperCase() })}
                    className='w-full text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary'
                    maxLength={3} placeholder='USD' />
                </div>
              </div>
              <div>
                <label className='block text-xs text-gray-600 mb-1'>Deposit basis for qualification</label>
                <select
                  value={form.cpa.qualification?.depositBasis ?? ''}
                  onChange={(e) =>
                    setField('cpa', {
                      ...form.cpa,
                      qualification: {
                        ...(form.cpa.qualification ?? {}),
                        depositBasis: e.target.value === '' ? null : (e.target.value as 'gross' | 'net'),
                      },
                    })
                  }
                  className='w-full text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary bg-white'>
                  <option value=''>Inherit from operator default</option>
                  <option value='gross'>Gross — face-value deposit</option>
                  <option value='net'>Net — deposit after processor fee</option>
                </select>
              </div>

              <div className='border-t border-green-200 pt-3 space-y-3'>
                <div>
                  <p className='text-xs font-semibold text-green-800'>Qualification gates</p>
                  <p className='text-[11px] text-gray-700 mt-0.5'>
                    Leave a field blank to inherit the operator default (Fees
                    page). FTDs that fail any active gate stay pending and
                    can promote on the next recalc.
                  </p>
                </div>
                <div className='grid grid-cols-2 sm:grid-cols-3 gap-3'>
                  <GateInput
                    label='Min deposit ($)'
                    value={form.cpa.qualification?.minDepositCents ?? null}
                    onChange={(v) => updateQual('minDepositCents', v)}
                    step={1}
                    fromCents
                  />
                  <GateInput
                    label='Min wager ($)'
                    value={form.cpa.qualification?.minWagerCents ?? null}
                    onChange={(v) => updateQual('minWagerCents', v)}
                    step={1}
                    fromCents
                  />
                  <GateInput
                    label='Min wager × deposit'
                    value={form.cpa.qualification?.minWagerMultiple ?? null}
                    onChange={(v) => updateQual('minWagerMultiple', v)}
                    step={0.1}
                  />
                  <GateInput
                    label='Hold period (days)'
                    value={form.cpa.qualification?.holdDays ?? null}
                    onChange={(v) => updateQual('holdDays', v)}
                    step={1}
                  />
                  <GateInput
                    label='Min net cash retained ($)'
                    value={form.cpa.qualification?.minCashRetentionCents ?? null}
                    onChange={(v) => updateQual('minCashRetentionCents', v)}
                    step={1}
                    fromCents
                  />
                </div>
              </div>
            </div>
          )}

          {/* Tiered config */}
          {showTiers && (
            <div className='bg-orange-50 rounded-lg p-4 space-y-3'>
              <div className='flex items-center justify-between'>
                <p className='text-xs font-semibold text-warning'>Tiers (on NGR)</p>
                <button type='button' onClick={addTier}
                  className='text-xs text-primary font-medium hover:underline'>+ Add tier</button>
              </div>
              {form.tiers.length === 0 && (
                <p className='text-xs text-gray-600'>No tiers yet. Add at least one.</p>
              )}
              {form.tiers.map((tier, i) => (
                <div key={i} className='flex gap-2 items-end'>
                  <div className='flex-1'>
                    <label className='block text-xs text-gray-600 mb-1'>From ($)</label>
                    <input type='number' min={0} step={1}
                      value={(tier.fromCents / 100).toFixed(0)}
                      onChange={(e) => updateTier(i, 'fromCents', Math.round(Number(e.target.value) * 100))}
                      className='w-full text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none' />
                  </div>
                  <div className='flex-1'>
                    <label className='block text-xs text-gray-600 mb-1'>To ($, blank=∞)</label>
                    <input type='number' min={0} step={1}
                      value={tier.toCents != null ? (tier.toCents / 100).toFixed(0) : ''}
                      onChange={(e) => updateTier(i, 'toCents', e.target.value === '' ? null : Math.round(Number(e.target.value) * 100))}
                      className='w-full text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none' />
                  </div>
                  <div className='w-20'>
                    <label className='block text-xs text-gray-600 mb-1'>Rate (%)</label>
                    <input type='number' min={0} max={100} step={0.1}
                      value={tier.rate}
                      onChange={(e) => updateTier(i, 'rate', Number(e.target.value))}
                      className='w-full text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none' />
                  </div>
                  <button type='button' onClick={() => removeTier(i)}
                    className='pb-2 text-red-400 hover:text-red-600 text-lg leading-none'>×</button>
                </div>
              ))}
            </div>
          )}

          {/* Default + Notes */}
          <div className='flex items-center gap-2'>
            <input id='isDefault' type='checkbox' checked={form.isDefault}
              onChange={(e) => setField('isDefault', e.target.checked)}
              className='w-4 h-4 accent-primary' />
            <label htmlFor='isDefault' className='text-sm text-gray-700'>Set as default plan</label>
          </div>

          <div>
            <label className='block text-xs font-medium text-gray-600 mb-1'>Notes (optional)</label>
            <textarea value={form.notes} onChange={(e) => setField('notes', e.target.value)} rows={2}
              className='w-full text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary resize-none' />
          </div>

          {upgradeBanner && (
            <UpgradeBanner
              message={upgradeBanner.message}
              currentPlan={upgradeBanner.currentPlan}
              requiredPlan={upgradeBanner.requiredPlan}
            />
          )}

          {error && <p className='text-xs text-red-500'>{error}</p>}

          <div className='flex justify-end gap-2 pt-1'>
            <button type='button' onClick={onClose}
              className='px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50'>
              Cancel
            </button>
            <button type='submit' disabled={isPending}
              className='px-4 py-2 text-sm rounded-lg bg-primary text-white font-medium hover:bg-primary/90 disabled:opacity-60'>
              {isPending ? 'Saving\u2026' : isEdit ? 'Save Changes' : 'Create Plan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// A number input where blank === null ("inherit operator default"). If
// `fromCents` is true the value is stored as integer cents but displayed
// in dollars.
function GateInput({
  label, value, onChange, step, fromCents,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  step?: number;
  fromCents?: boolean;
}) {
  const display = value == null ? '' : fromCents ? (value / 100).toString() : String(value);
  return (
    <label className='flex flex-col gap-1'>
      <span className='text-xs text-gray-600'>{label}</span>
      <input
        type='number'
        min={0}
        step={step ?? 1}
        value={display}
        placeholder='Inherit'
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') return onChange(null);
          const n = Number(raw);
          if (!Number.isFinite(n)) return;
          onChange(fromCents ? Math.round(n * 100) : n);
        }}
        className='text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary bg-white'
      />
    </label>
  );
}

// ── Plans Tab ─────────────────────────────────────────────────────────────────

function PlansTab() {
  const [modal, setModal] = useState<'new' | CommissionPlan | null>(null);

  const { data: plans = [], isLoading, refetch } = useBaseQuery<CommissionPlan[]>({
    endpoint: COMMISSION_API_URLS.PLANS(),
    queryKey: ['commission-plans'],
  });

  async function handleSetDefault(id: string) {
    await axiosInstance.post(COMMISSION_API_URLS.PLAN_SET_DEFAULT(id));
    refetch();
  }

  async function handleDelete(id: string) {
    await axiosInstance.delete(COMMISSION_API_URLS.PLAN(id));
    refetch();
  }

  return (
    <div className='space-y-4'>
      <div className='flex justify-end'>
        <button onClick={() => setModal('new')}
          className='px-4 py-2 text-sm bg-primary text-white rounded-lg font-medium hover:bg-primary/90'>
          + New Plan
        </button>
      </div>

      <div className='bg-white/80 backdrop-blur-sm rounded-xl border border-violet-100 overflow-hidden'>
        {isLoading && <p className='text-sm text-gray-600 px-5 py-6 text-center'>Loading…</p>}

        {!isLoading && plans.length === 0 && (
          <p className='text-sm text-gray-600 px-5 py-10 text-center'>
            No commission plans yet. Create one to get started.
          </p>
        )}

        {plans.length > 0 && (
          <table className='w-full'>
            <thead className='bg-gray-50'>
              <tr>
                {['Name', 'Product', 'Type', 'Summary', 'Default', 'Active', ''].map((h) => (
                  <th key={h} className='px-5 py-3 text-left text-xs font-semibold text-gray-700 border-r border-gray-100 last:border-r-0'>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {plans.map((p, i) => (
                <tr key={p._id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className='px-5 py-3 text-sm font-medium text-gray-800 border-r border-gray-100'>{p.name}</td>
                  <td className='px-5 py-3 border-r border-gray-100'>
                    <span className='inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700 capitalize'>
                      {p.product ?? 'casino'}
                    </span>
                  </td>
                  <td className='px-5 py-3 border-r border-gray-100'>
                    <span className={planTypeBadge(p.type)}>{planTypeLabel(p.type)}</span>
                  </td>
                  <td className='px-5 py-3 text-xs text-gray-600 border-r border-gray-100'>{planSummary(p)}</td>
                  <td className='px-5 py-3 border-r border-gray-100 w-20'>
                    {p.isDefault
                      ? <span className='text-xs font-semibold text-primary'>Default</span>
                      : <button onClick={() => handleSetDefault(p._id)}
                          className='text-xs text-gray-600 hover:text-primary hover:underline'>Set default</button>}
                  </td>
                  <td className='px-5 py-3 border-r border-gray-100 w-16'>
                    {p.isActive
                      ? <span className='text-green-600 font-bold'>✓</span>
                      : <span className='text-gray-300 font-bold'>✕</span>}
                  </td>
                  <td className='px-5 py-3 w-24'>
                    <div className='flex gap-3'>
                      <button onClick={() => setModal(p)} className='text-xs text-primary hover:underline'>Edit</button>
                      {!p.isDefault && (
                        <button onClick={() => handleDelete(p._id)}
                          className='text-xs text-red-400 hover:underline'>Delete</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal === 'new' && <PlanModal onClose={() => setModal(null)} onSaved={() => { refetch(); setModal(null); }} />}
      {modal && modal !== 'new' && <PlanModal plan={modal as CommissionPlan} onClose={() => setModal(null)} onSaved={() => { refetch(); setModal(null); }} />}
    </div>
  );
}

// ── Reports Tab ───────────────────────────────────────────────────────────────

function ReportsTab() {
  const def  = currentYearMonth();
  const [year, setYear]   = useState(def.year);
  const [month, setMonth] = useState(def.month);
  const [status, setStatus] = useState('');
  const [page, setPage]   = useState(1);
  const [calcResult, setCalcResult] = useState<any>(null);

  const params: Record<string, any> = { year, month, page, limit: 50 };
  if (status) params.status = status;

  const { data, isLoading, refetch } = useBaseQuery<ReportsResponse>({
    endpoint: COMMISSION_API_URLS.REPORTS(),
    queryKey: ['commission-reports', params],
    params,
  });

  const { mutate: calculate, isPending: calculating } = useBaseMutation({
    endpoint: COMMISSION_API_URLS.REPORTS_CALCULATE(),
    method: 'post',
    onSuccess: (d: any) => { setCalcResult(d); refetch(); },
    onError: (e: any) => alert(e?.response?.data?.error ?? e?.message ?? 'Calculation failed'),
  });

  const { mutate: submitAll, isPending: submitting } = useBaseMutation({
    endpoint: COMMISSION_API_URLS.REPORTS_SUBMIT(),
    method: 'post',
    onSuccess: () => refetch(),
    onError: (e: any) => alert(e?.response?.data?.error ?? e?.message),
  });

  const { mutate: approveAll, isPending: approving } = useBaseMutation({
    endpoint: COMMISSION_API_URLS.REPORTS_APPROVE(),
    method: 'post',
    onSuccess: () => refetch(),
    onError: (e: any) => alert(e?.response?.data?.error ?? e?.message),
  });

  const { mutate: markPaidAll, isPending: paying } = useBaseMutation({
    endpoint: COMMISSION_API_URLS.REPORTS_MARK_PAID(),
    method: 'post',
    onSuccess: () => refetch(),
    onError: (e: any) => alert(e?.response?.data?.error ?? e?.message),
  });

  const reports = data?.reports ?? [];
  const total   = data?.total ?? 0;

  const totalCommission = reports.reduce((s, r) => s + r.breakdown.totalCents, 0);

  const years = Array.from({ length: 5 }, (_, i) => def.year - i);

  return (
    <div className='space-y-4'>
      {/* Period + controls */}
      <div className='flex flex-wrap gap-3 items-end justify-between'>
        <div className='flex gap-3 items-end flex-wrap'>
          {/* Year */}
          <div className='flex flex-col gap-1'>
            <label className='text-xs text-gray-700 font-medium'>Year</label>
            <select value={year} onChange={(e) => { setYear(Number(e.target.value)); setPage(1); setCalcResult(null); }}
              className='h-9 text-sm rounded-lg border border-gray-200 px-3 focus:outline-none focus:border-primary bg-white'>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          {/* Month */}
          <div className='flex flex-col gap-1'>
            <label className='text-xs text-gray-700 font-medium'>Month</label>
            <select value={month} onChange={(e) => { setMonth(Number(e.target.value)); setPage(1); setCalcResult(null); }}
              className='h-9 text-sm rounded-lg border border-gray-200 px-3 focus:outline-none focus:border-primary bg-white'>
              {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
            </select>
          </div>

          {/* Status filter */}
          <div className='flex flex-col gap-1'>
            <label className='text-xs text-gray-700 font-medium'>Status</label>
            <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}
              className='h-9 text-sm rounded-lg border border-gray-200 px-3 focus:outline-none focus:border-primary bg-white'>
              <option value=''>All</option>
              <option value='draft'>Draft</option>
              <option value='pending_approval'>Pending Approval</option>
              <option value='approved'>Approved</option>
              <option value='paid'>Paid</option>
            </select>
          </div>
        </div>

        {/* Action buttons */}
        <div className='flex gap-2 flex-wrap'>
          <button onClick={() => calculate({ year, month } as any)} disabled={calculating}
            className='h-9 px-4 text-sm bg-primary text-white rounded-lg font-medium hover:bg-primary/90 disabled:opacity-60'>
            {calculating ? 'Calculating…' : 'Calculate'}
          </button>
          <button onClick={() => submitAll({ year, month } as any)} disabled={submitting}
            className='h-9 px-4 text-sm bg-gray-700 text-white rounded-lg font-medium hover:bg-gray-800 disabled:opacity-60'>
            {submitting ? '…' : 'Submit All'}
          </button>
          <button onClick={() => approveAll({ year, month } as any)} disabled={approving}
            className='h-9 px-4 text-sm bg-primary text-white rounded-lg font-medium hover:bg-primary-dark disabled:opacity-60'>
            {approving ? '…' : 'Approve All'}
          </button>
          <button onClick={() => markPaidAll({ year, month } as any)} disabled={paying}
            className='h-9 px-4 text-sm bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-60'>
            {paying ? '…' : 'Mark Paid'}
          </button>
        </div>
      </div>

      {/* Calc result banner */}
      {calcResult && (
        <div className='bg-violet-50 rounded-lg px-4 py-3 text-xs text-violet-700 flex gap-4'>
          <span><span className='font-semibold'>{calcResult.created}</span> created</span>
          <span><span className='font-semibold'>{calcResult.updated}</span> updated</span>
          {calcResult.skipped > 0 && <span><span className='font-semibold'>{calcResult.skipped}</span> skipped (locked)</span>}
          {calcResult.failed?.length > 0 && <span className='text-red-600'><span className='font-semibold'>{calcResult.failed.length}</span> failed</span>}
        </div>
      )}

      {/* Summary row */}
      {reports.length > 0 && (
        <div className='grid grid-cols-3 gap-4'>
          {[
            { label: 'Total Commission', value: cents(totalCommission) },
            { label: 'Affiliates', value: String(total) },
            { label: 'Period', value: `${MONTHS[month - 1]} ${year}` },
          ].map((c) => (
            <div key={c.label} className='bg-white rounded-xl border border-gray-100 px-5 py-4'>
              <p className='text-xs text-gray-700'>{c.label}</p>
              <p className='text-xl font-semibold text-gray-800 mt-1'>{c.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      <div className='bg-white/80 backdrop-blur-sm rounded-xl border border-violet-100 overflow-hidden'>
        {isLoading && <p className='text-sm text-gray-600 px-5 py-6 text-center'>Loading…</p>}

        {!isLoading && reports.length === 0 && (
          <p className='text-sm text-gray-600 px-5 py-10 text-center'>
            No reports for {MONTHS[month - 1]} {year}. Click &quot;Calculate&quot; to generate.
          </p>
        )}

        {reports.length > 0 && (
          <>
            <div className='overflow-x-auto'>
              <table className='w-full'>
                <thead className='bg-gray-50'>
                  <tr>
                    {['Affiliate', 'Product', 'Plan', 'Players', 'FTDs', 'GGR', 'NGR', 'RevShare', 'CPA', 'Total', 'Status'].map((h) => (
                      <th key={h} className='px-4 py-3 text-left text-xs font-semibold text-gray-700 border-r border-gray-100 last:border-r-0 whitespace-nowrap'>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reports.map((r, i) => {
                    const badge = statusBadge(r.status);
                    return (
                      <tr key={r._id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className='px-4 py-2.5 border-r border-gray-100'>
                          <div className='text-xs font-medium text-gray-800'>{r.affiliateId?.username ?? '—'}</div>
                          <div className='text-xs text-gray-600'>{r.affiliateCode ?? ''}</div>
                        </td>
                        <td className='px-4 py-2.5 border-r border-gray-100'>
                          <span className='inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-700 capitalize'>
                            {r.product ?? 'casino'}
                          </span>
                        </td>
                        <td className='px-4 py-2.5 border-r border-gray-100'>
                          {r.planId
                            ? <span className={planTypeBadge(r.planId.type)}>{r.planId.name}</span>
                            : <span className='text-xs text-gray-600'>No plan</span>}
                        </td>
                        <td className='px-4 py-2.5 text-xs text-gray-700 border-r border-gray-100 text-right'>{r.metrics.playerCount}</td>
                        <td className='px-4 py-2.5 text-xs text-gray-700 border-r border-gray-100 text-right'>
                          <span>{r.metrics.ftdCount}</span>
                          {(r.metrics.pendingFtdCount ?? 0) + (r.metrics.rejectedFtdCount ?? 0) > 0 && (
                            <span
                              className='ml-1 inline-flex items-center px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-[10px] font-semibold'
                              title={`Qualified ${r.metrics.qualifiedFtdCount ?? 0} · Pending ${r.metrics.pendingFtdCount ?? 0} · Rejected ${r.metrics.rejectedFtdCount ?? 0}`}
                            >
                              {r.metrics.qualifiedFtdCount ?? 0}✓
                            </span>
                          )}
                        </td>
                        <td className='px-4 py-2.5 text-xs text-gray-700 border-r border-gray-100 text-right'>{cents(r.metrics.ggrCents)}</td>
                        <td className='px-4 py-2.5 text-xs text-gray-700 border-r border-gray-100 text-right'>{cents(r.metrics.ngrCents)}</td>
                        <td className='px-4 py-2.5 text-xs text-gray-700 border-r border-gray-100 text-right'>{cents(r.breakdown.revshareAmountCents)}</td>
                        <td className='px-4 py-2.5 text-xs text-gray-700 border-r border-gray-100 text-right'>{cents(r.breakdown.cpaAmountCents)}</td>
                        <td className='px-4 py-2.5 text-xs font-semibold text-gray-800 border-r border-gray-100 text-right'>{cents(r.breakdown.totalCents)}</td>
                        <td className='px-4 py-2.5'>
                          <span className={badge.cls}>{badge.label}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {total > 50 && (
              <div className='flex items-center justify-between px-5 py-3 border-t border-gray-100'>
                <p className='text-xs text-gray-600'>{total} affiliates · page {page} of {Math.ceil(total / 50)}</p>
                <div className='flex gap-2'>
                  <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                    className='px-3 py-1.5 text-xs rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50'>Prev</button>
                  <button onClick={() => setPage((p) => Math.min(Math.ceil(total / 50), p + 1))} disabled={page === Math.ceil(total / 50)}
                    className='px-3 py-1.5 text-xs rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50'>Next</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Commission() {
  const [activeTab, setActiveTab] = useState<Tab>('Reports');

  return (
    <div className='h-full overflow-auto p-6 pb-24 space-y-5'>
      <h1 className='text-xl font-semibold text-gray-800'>Commission</h1>

      <div className='flex gap-1 bg-white rounded-xl p-1 shadow-sm border border-gray-100 w-full'>
        {TABS.map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab ? 'bg-primary text-white' : 'text-gray-700 hover:text-gray-700'
            }`}>
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'Plans'   && <PlansTab />}
      {activeTab === 'Reports' && <ReportsTab />}
    </div>
  );
}
