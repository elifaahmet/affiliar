import { useMemo, useRef, useState } from 'react';
import { useBaseMutation } from 'api/core/useBaseMutation';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import { REFER_API_URLS } from 'config/apiUrls';

import StyledSelect from '@components/core-components/StyledSelect';
import NumberField from '@components/core-components/number-field';
import type { Brand, ReferConfig, CrewLevel } from '../types';
import DeliveriesPanel from './DeliveriesPanel';
import WebhookPanel from './WebhookPanel';
import { useOperatorPlan } from 'hooks/useOperatorPlan';

const DEFAULT_CREW_LEVELS: CrewLevel[] = [
  { activeReferrals: 3,  percent: 3 },
  { activeReferrals: 5,  percent: 5 },
  { activeReferrals: 10, percent: 8 },
  { activeReferrals: 15, percent: 12 },
  { activeReferrals: 20, percent: 15 },
  { activeReferrals: 25, percent: 18 },
];

interface Props {
  brand: Brand;
  existingConfig: ReferConfig | null;
  onSaved: () => void;
}

const DEFAULT_CONFIG: Omit<ReferConfig, 'brandId'> = {
  enabled: false,
  reward: {
    type: 'fixed_bonus',
    amountCents: 500,
    percent: 10,
    capCents: null,
    crewLevels: DEFAULT_CREW_LEVELS,
    crewMetric: 'ngr',
    crewMonthlyCapCents: null,
    currency: 'EUR',
    rewardKind: 'bonus',
  },
  refereeReward: {
    enabled: false,
    type: 'fixed_bonus',
    amountCents: 500,
    percent: 10,
    capCents: null,
    rewardKind: 'bonus',
  },
  recurringReward: {
    enabled: false,
    percent: 5,
    ngrMetric: 'ngr',
    durationMonths: 6,
    monthlyCapCents: null,
    rewardKind: 'cash',
  },
  qualification: {
    minDepositCents: 1000,
    holdDays: 7,
    minWagerCents: 0,
    minWagerMultiple: 3,
    minActiveDeposits: 0,
    minAccountAgeDays: 0,
    requirePositiveNgr: false,
    blockSameSignals: false,
  },
  caps: {
    perReferrerMonthlyCents: 0,
    perBrandMonthlyCents: 0,
  },
};

function buildInitialForm(existingConfig: ReferConfig | null): Omit<ReferConfig, 'brandId'> {
  return {
    ...DEFAULT_CONFIG,
    ...(existingConfig ?? {}),
    reward:          { ...DEFAULT_CONFIG.reward,          ...(existingConfig?.reward ?? {}) },
    refereeReward:   { ...DEFAULT_CONFIG.refereeReward,   ...(existingConfig?.refereeReward ?? {}) },
    recurringReward: { ...DEFAULT_CONFIG.recurringReward, ...(existingConfig?.recurringReward ?? {}) },
    qualification:   { ...DEFAULT_CONFIG.qualification,   ...(existingConfig?.qualification ?? {}) },
    caps:            { ...DEFAULT_CONFIG.caps,            ...(existingConfig?.caps ?? {}) },
  };
}

export default function BrandConfigCard({ brand, existingConfig, onSaved }: Props) {
  const queryClient = useQueryClient();
  const { limits } = useOperatorPlan();
  // Crew (tiered) is a Pro-plan feature. limits.crewSystem comes back true
  // for pro operators (and for anyone with a Operator.featureOverrides
  // override granting it for a custom deal). BE rejects too if a stale FE
  // sends the type through on a plan that doesn't carry it.
  const crewEnabled = !!(limits as { crewSystem?: boolean } | null)?.crewSystem;
  const [open, setOpen]   = useState(!!existingConfig?.enabled);
  const [form, setForm]   = useState<Omit<ReferConfig, 'brandId'>>(() => buildInitialForm(existingConfig));
  const [baseline, setBaseline] = useState<Omit<ReferConfig, 'brandId'>>(() => buildInitialForm(existingConfig));
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const isDirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(baseline),
    [form, baseline],
  );

  const upsert = useBaseMutation({
    endpoint: REFER_API_URLS.CONFIG(brand._id),
    method: 'update',
    onSuccess: () => {
      setSavedNotice('Saved.');
      setTimeout(() => setSavedNotice(null), 2200);
      setBaseline(form);
      queryClient.invalidateQueries({ queryKey: ['refer-configs'] });
      onSaved();
    },
  });

  function handleSave() {
    if (!isDirty || upsert.isPending) return;
    upsert.mutate({
      enabled: form.enabled,
      reward: form.reward,
      refereeReward: form.refereeReward,
      recurringReward: form.recurringReward,
      qualification: form.qualification,
      caps: form.caps,
    });
  }

  function setReward<K extends keyof ReferConfig['reward']>(key: K, value: ReferConfig['reward'][K]) {
    setForm((f) => ({ ...f, reward: { ...f.reward, [key]: value } }));
  }
  function setRefereeReward<K extends keyof ReferConfig['refereeReward']>(key: K, value: ReferConfig['refereeReward'][K]) {
    setForm((f) => ({ ...f, refereeReward: { ...f.refereeReward, [key]: value } }));
  }
  function setRecurring<K extends keyof ReferConfig['recurringReward']>(key: K, value: ReferConfig['recurringReward'][K]) {
    setForm((f) => ({ ...f, recurringReward: { ...f.recurringReward, [key]: value } }));
  }
  function setQual<K extends keyof ReferConfig['qualification']>(key: K, value: ReferConfig['qualification'][K]) {
    setForm((f) => ({ ...f, qualification: { ...f.qualification, [key]: value } }));
  }
  function setCap<K extends keyof ReferConfig['caps']>(key: K, value: ReferConfig['caps'][K]) {
    setForm((f) => ({ ...f, caps: { ...f.caps, [key]: value } }));
  }

  return (
    <div className='bg-white/80 backdrop-blur-sm rounded-xl border border-violet-100 overflow-hidden'>
      {/* Header */}
      <button
        type='button'
        onClick={() => setOpen((o) => !o)}
        className='w-full flex items-center justify-between px-5 py-4 hover:bg-violet-50/50 transition-colors'
      >
        <div className='flex items-center gap-3'>
          <span className={`inline-flex items-center justify-center w-2 h-2 rounded-full ${form.enabled ? 'bg-green-500' : 'bg-gray-300'}`} />
          <div className='text-left'>
            <p className='font-semibold text-gray-900'>{brand.name}</p>
            <p className='text-xs text-gray-700'>
              {form.enabled ? 'Active' : 'Disabled'}
            </p>
          </div>
        </div>
        <ChevronDownIcon className={`h-4 w-4 text-gray-600 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className='border-t border-violet-100 p-5 space-y-6'>
          {/* Master toggle */}
          <div className='flex items-center justify-between gap-4 p-3 rounded-lg bg-violet-50/40'>
            <div>
              <p className='text-sm font-medium text-gray-900'>Enable Refer-a-Friend for this brand</p>
              <p className='text-xs text-gray-700'>New track-signup calls are accepted only when enabled. In-flight referrals continue regardless.</p>
            </div>
            <input
              type='checkbox'
              checked={form.enabled}
              onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
              className='h-5 w-5 rounded accent-primary cursor-pointer'
            />
          </div>

          {/* Reward */}
          <Section title='Reward'>
            <Row>
              <Field label='Type'>
                <StyledSelect
                  value={form.reward.type}
                  onChange={(v) => setReward('type', v as any)}
                  options={[
                    { value: 'fixed_bonus', label: 'Fixed bonus' },
                    { value: 'percent_of_first_deposit', label: 'Percent of first deposit' },
                    ...(crewEnabled
                      ? [{ value: 'crew_tiered', label: 'Crew (tiered)' }]
                      : []),
                  ]}
                />
              </Field>
              <Field label='Reward kind'>
                <StyledSelect
                  value={form.reward.rewardKind}
                  onChange={(v) => setReward('rewardKind', v as any)}
                  options={[
                    { value: 'bonus', label: 'Bonus' },
                    { value: 'cash', label: 'Cash' },
                    { value: 'freespins', label: 'Free spins' },
                  ]}
                />
              </Field>
              <Field label='Currency'>
                <input
                  type='text'
                  value={form.reward.currency}
                  onChange={(e) => setReward('currency', e.target.value.toUpperCase().slice(0, 3))}
                  className='w-full text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary uppercase'
                />
              </Field>
            </Row>
            {form.reward.type === 'fixed_bonus' && (
              <Row>
                <Field label='Amount (cents)' hint='Flat reward per qualified referral'>
                  <input
                    type='number'
                    min={0}
                    value={form.reward.amountCents || ''}
                    onChange={(e) => setReward('amountCents', Number(e.target.value) || 0)}
                    className='w-full text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary'
                  />
                </Field>
              </Row>
            )}
            {form.reward.type === 'percent_of_first_deposit' && (
              <Row>
                <Field label='Percent' hint='0–100'>
                  <input
                    type='number'
                    min={0}
                    max={100}
                    value={form.reward.percent || ''}
                    onChange={(e) => setReward('percent', Number(e.target.value) || 0)}
                    className='w-full text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary'
                  />
                </Field>
                <Field label='Cap (cents)' hint='Optional max payout. Empty = no cap.'>
                  <input
                    type='number'
                    min={0}
                    value={form.reward.capCents ?? ''}
                    onChange={(e) =>
                      setReward('capCents', e.target.value === '' ? null : Number(e.target.value) || 0)
                    }
                    className='w-full text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary'
                  />
                </Field>
              </Row>
            )}
            {form.reward.type === 'crew_tiered' && (
              <CrewTierEditor
                levels={form.reward.crewLevels ?? DEFAULT_CREW_LEVELS}
                metric={form.reward.crewMetric ?? 'ngr'}
                monthlyCapCents={form.reward.crewMonthlyCapCents ?? null}
                onLevelsChange={(levels) => setReward('crewLevels', levels)}
                onMetricChange={(metric) => setReward('crewMetric', metric)}
                onCapChange={(cap) => setReward('crewMonthlyCapCents', cap)}
              />
            )}
          </Section>

          {/* Referee reward (Phase 2 two-sided rewards) */}
          <Section title='Referee reward' hint='Optional welcome bonus paid to the friend at the same time the referrer is rewarded. Currency inherits from the main reward.'>
            <div className='flex items-center justify-between gap-4 p-3 rounded-lg bg-violet-50/40'>
              <div>
                <p className='text-sm font-medium text-gray-900'>Pay the friend too</p>
                <p className='text-xs text-gray-700'>
                  Emits a <code className='text-[11px] font-mono'>referral.reward.referee.issued</code> ledger row on qualification.
                  Casino backend picks it up when the friend visits their rewards page.
                </p>
              </div>
              <input
                type='checkbox'
                checked={form.refereeReward.enabled}
                onChange={(e) => setRefereeReward('enabled', e.target.checked)}
                className='h-5 w-5 rounded accent-primary cursor-pointer'
              />
            </div>

            {form.refereeReward.enabled && (
              <>
                <Row>
                  <Field label='Type'>
                    <StyledSelect
                      value={form.refereeReward.type}
                      onChange={(v) => setRefereeReward('type', v as any)}
                      options={[
                        { value: 'fixed_bonus', label: 'Fixed bonus' },
                        { value: 'percent_of_first_deposit', label: 'Percent of first deposit' },
                      ]}
                    />
                  </Field>
                  <Field label='Reward kind'>
                    <StyledSelect
                      value={form.refereeReward.rewardKind}
                      onChange={(v) => setRefereeReward('rewardKind', v as any)}
                      options={[
                        { value: 'bonus', label: 'Bonus' },
                        { value: 'cash', label: 'Cash' },
                        { value: 'freespins', label: 'Free spins' },
                      ]}
                    />
                  </Field>
                </Row>
                {form.refereeReward.type === 'fixed_bonus' && (
                  <Row>
                    <Field label='Amount (cents)' hint='Flat welcome bonus per qualified referral'>
                      <input
                        type='number' min={0}
                        value={form.refereeReward.amountCents || ''}
                        onChange={(e) => setRefereeReward('amountCents', Number(e.target.value) || 0)}
                        className='w-full text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary'
                      />
                    </Field>
                  </Row>
                )}
                {form.refereeReward.type === 'percent_of_first_deposit' && (
                  <Row>
                    <Field label='Percent' hint='0–100 of friend’s FTD'>
                      <input
                        type='number' min={0} max={100}
                        value={form.refereeReward.percent || ''}
                        onChange={(e) => setRefereeReward('percent', Number(e.target.value) || 0)}
                        className='w-full text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary'
                      />
                    </Field>
                    <Field label='Cap (cents)' hint='Optional max payout. Empty = no cap.'>
                      <input
                        type='number' min={0}
                        value={form.refereeReward.capCents ?? ''}
                        onChange={(e) =>
                          setRefereeReward('capCents', e.target.value === '' ? null : Number(e.target.value) || 0)
                        }
                        className='w-full text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary'
                      />
                    </Field>
                  </Row>
                )}
              </>
            )}
          </Section>

          {/* Recurring referrer reward (Phase 2 Step 4). Hidden when the main
              reward is Crew (tiered): the tiers already define a recurring
              monthly % of NGR/GGR, and the recurring job pays via the crew
              branch and ignores recurringReward when reward.type ===
              'crew_tiered'. */}
          {form.reward.type !== 'crew_tiered' && (
          <Section title='Recurring referrer reward' hint='Optional ongoing % of the friend’s monthly NGR/GGR. Pays once per calendar month for as long as the referral stays active.'>
            <div className='flex items-center justify-between gap-4 p-3 rounded-lg bg-violet-50/40'>
              <div>
                <p className='text-sm font-medium text-gray-900'>Pay the referrer monthly</p>
                <p className='text-xs text-gray-700'>
                  Emits a <code className='text-[11px] font-mono'>referral.reward.recurring.issued</code> ledger row on day 5 of each month for the previous month. Stops automatically when the friend's FTD is reversed (past payments stay).
                </p>
              </div>
              <input
                type='checkbox'
                checked={form.recurringReward.enabled}
                onChange={(e) => setRecurring('enabled', e.target.checked)}
                className='h-5 w-5 rounded accent-primary cursor-pointer'
              />
            </div>

            {form.recurringReward.enabled && (
              <>
                <Row>
                  <Field label='Percent' hint='0–100 of friend’s monthly base'>
                    <input
                      type='number' min={0} max={100}
                      value={form.recurringReward.percent || ''}
                      onChange={(e) => setRecurring('percent', Number(e.target.value) || 0)}
                      className='w-full text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary'
                    />
                  </Field>
                  <Field label='Base metric' hint='NGR = bets−wins−bonuses · GGR = bets−wins'>
                    <StyledSelect
                      value={form.recurringReward.ngrMetric}
                      onChange={(v) => setRecurring('ngrMetric', v as any)}
                      options={[
                        { value: 'ngr', label: 'NGR', description: 'bets − wins − bonuses' },
                        { value: 'ggr', label: 'GGR', description: 'bets − wins' },
                      ]}
                    />
                  </Field>
                  <Field label='Reward kind'>
                    <StyledSelect
                      value={form.recurringReward.rewardKind}
                      onChange={(v) => setRecurring('rewardKind', v as any)}
                      options={[
                        { value: 'cash', label: 'Cash' },
                        { value: 'bonus', label: 'Bonus' },
                        { value: 'freespins', label: 'Free spins' },
                      ]}
                    />
                  </Field>
                </Row>
                <Row>
                  <Field label='Duration (months)' hint='Empty = forever'>
                    <input
                      type='number' min={1}
                      value={form.recurringReward.durationMonths ?? ''}
                      onChange={(e) =>
                        setRecurring('durationMonths', e.target.value === '' ? null : Number(e.target.value) || null)
                      }
                      className='w-full text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary'
                    />
                  </Field>
                  <Field label='Monthly cap (cents)' hint='Empty = no cap'>
                    <input
                      type='number' min={0}
                      value={form.recurringReward.monthlyCapCents ?? ''}
                      onChange={(e) =>
                        setRecurring('monthlyCapCents', e.target.value === '' ? null : Number(e.target.value) || 0)
                      }
                      className='w-full text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary'
                    />
                  </Field>
                </Row>
              </>
            )}
          </Section>
          )}

          {/* Qualification */}
          <Section title='Qualification gates'>
            <Row>
              <Field label='Min deposit (cents)' hint='Below this → rejected'>
                <input
                  type='number' min={0}
                  value={form.qualification.minDepositCents || ''}
                  onChange={(e) => setQual('minDepositCents', Number(e.target.value) || 0)}
                  className='w-full text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary'
                />
              </Field>
              <Field label='Hold period (days)' hint='Wait N days after FTD before paying'>
                <input
                  type='number' min={0}
                  value={form.qualification.holdDays || ''}
                  onChange={(e) => setQual('holdDays', Number(e.target.value) || 0)}
                  className='w-full text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary'
                />
              </Field>
            </Row>
            <Row>
              <Field label='Min wager (cents)' hint='Flat wager floor; 0 = none'>
                <input
                  type='number' min={0}
                  value={form.qualification.minWagerCents || ''}
                  onChange={(e) => setQual('minWagerCents', Number(e.target.value) || 0)}
                  className='w-full text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary'
                />
              </Field>
              <Field label='Min wager × FTD' hint='e.g. 3 → wager 3× the FTD amount'>
                <input
                  type='number' min={0}
                  value={form.qualification.minWagerMultiple || ''}
                  onChange={(e) => setQual('minWagerMultiple', Number(e.target.value) || 0)}
                  className='w-full text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary'
                />
              </Field>
            </Row>
            <Row>
              <Field label='Min deposit count' hint='Number of confirmed deposits required. 0 = off.'>
                <input
                  type='number' min={0}
                  value={form.qualification.minActiveDeposits || ''}
                  onChange={(e) => setQual('minActiveDeposits', Number(e.target.value) || 0)}
                  className='w-full text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary'
                />
              </Field>
              <Field label='Min account age (days)' hint='Days since referee signed up. 0 = off.'>
                <input
                  type='number' min={0}
                  value={form.qualification.minAccountAgeDays || ''}
                  onChange={(e) => setQual('minAccountAgeDays', Number(e.target.value) || 0)}
                  className='w-full text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary'
                />
              </Field>
            </Row>
            <Row>
              <Field label='Require positive NGR' hint='Referee&apos;s lifetime NGR must be &gt; 0 (only profitable players count).'>
                <label className='flex items-center gap-2 text-sm text-gray-700'>
                  <input
                    type='checkbox'
                    checked={form.qualification.requirePositiveNgr}
                    onChange={(e) => setQual('requirePositiveNgr', e.target.checked)}
                    className='h-4 w-4 rounded accent-primary cursor-pointer'
                  />
                  Enabled
                </label>
              </Field>
              <Field
                label='Block same-signal accounts'
                hint='Reject signup when the referee shares IP, device, or wallet hash with another account. Requires your casino backend to send ipHash/deviceHash/walletHash on player.registered + wallet.deposit.confirmed.'
              >
                <label className='flex items-center gap-2 text-sm text-gray-700'>
                  <input
                    type='checkbox'
                    checked={form.qualification.blockSameSignals}
                    onChange={(e) => setQual('blockSameSignals', e.target.checked)}
                    className='h-4 w-4 rounded accent-primary cursor-pointer'
                  />
                  Enabled
                </label>
              </Field>
            </Row>
          </Section>

          {/* Caps */}
          <Section title='Monthly spend caps' hint='0 = no cap'>
            <Row>
              <Field label='Per referrer (cents)'>
                <input
                  type='number' min={0}
                  value={form.caps.perReferrerMonthlyCents || ''}
                  onChange={(e) => setCap('perReferrerMonthlyCents', Number(e.target.value) || 0)}
                  className='w-full text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary'
                />
              </Field>
              <Field label='Per brand (cents)'>
                <input
                  type='number' min={0}
                  value={form.caps.perBrandMonthlyCents || ''}
                  onChange={(e) => setCap('perBrandMonthlyCents', Number(e.target.value) || 0)}
                  className='w-full text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary'
                />
              </Field>
            </Row>
          </Section>

          {/* Reward ledger — pending pickups + recently claimed */}
          <DeliveriesPanel brandId={brand._id} />

          {/* Optional push delivery on top of the pull ledger above */}
          <div className='rounded-lg border border-violet-100'>
            <WebhookPanel brandId={brand._id} />
          </div>

          {/* Save */}
          <div className='flex items-center gap-3 pt-2 border-t border-violet-100'>
            <button
              type='button'
              onClick={handleSave}
              disabled={upsert.isPending || !isDirty}
              className='h-9 px-5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-dark disabled:opacity-60 disabled:cursor-not-allowed'
            >
              {upsert.isPending ? 'Saving…' : 'Save changes'}
            </button>
            {!isDirty && !savedNotice && (
              <span className='text-xs text-gray-700'>No pending changes</span>
            )}
            {savedNotice && <span className='text-xs text-green-700'>{savedNotice}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tiny layout primitives kept local so the file is self-contained ──────────

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className='space-y-3'>
      <div>
        <h3 className='text-sm font-semibold text-gray-900'>{title}</h3>
        {hint && <p className='text-xs text-gray-700 mt-0.5'>{hint}</p>}
      </div>
      <div className='space-y-3'>{children}</div>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className='grid sm:grid-cols-2 lg:grid-cols-3 gap-3'>{children}</div>;
}

function Field({
  label,
  hint,
  wide,
  children,
}: {
  label: string;
  hint?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={wide ? 'sm:col-span-2 lg:col-span-3' : ''}>
      <label className='mb-1 block text-xs font-medium text-gray-700'>{label}</label>
      {children}
      {hint && <p className='text-[11px] text-gray-600 mt-1'>{hint}</p>}
    </div>
  );
}

/* ── Crew tier editor ─────────────────────────────────────────────────────
   Inline editor for reward.crewLevels[] when reward.type === 'crew_tiered'.
   Each row = { activeReferrals threshold, percent of NGR }. Operator can
   add, remove, edit; the strategy module sorts rows defensively so any
   ordering renders correctly on save.
   ────────────────────────────────────────────────────────────────────── */
function CrewTierEditor({
  levels, metric, monthlyCapCents,
  onLevelsChange, onMetricChange, onCapChange,
}: {
  levels: CrewLevel[];
  metric: 'ngr' | 'ggr';
  monthlyCapCents: number | null;
  onLevelsChange: (levels: CrewLevel[]) => void;
  onMetricChange: (metric: 'ngr' | 'ggr') => void;
  onCapChange: (capCents: number | null) => void;
}) {
  // NumberField is uncontrolled, so each row needs a stable React key —
  // otherwise removing a middle row would leave its typed value behind in the
  // row that shifts up into its place. Keys are kept aligned with `levels` as
  // rows are added/removed; the length guard re-seeds them if `levels` changes
  // from the outside (e.g. switching the reward type).
  const idSeq = useRef(0);
  const rowIds = useRef<number[]>([]);
  if (rowIds.current.length !== levels.length) {
    rowIds.current = levels.map((_, i) => rowIds.current[i] ?? idSeq.current++);
  }

  const updateRow = (idx: number, patch: Partial<CrewLevel>) => {
    onLevelsChange(levels.map((lvl, i) => (i === idx ? { ...lvl, ...patch } : lvl)));
  };
  const addRow = () => {
    const last = levels[levels.length - 1];
    rowIds.current = [...rowIds.current, idSeq.current++];
    onLevelsChange([
      ...levels,
      {
        activeReferrals: (last?.activeReferrals ?? 0) + 5,
        percent:         Math.min(100, (last?.percent ?? 0) + 3),
        name:            '',
      },
    ]);
  };

  // Level number = the row's rank when sorted ascending by threshold (same
  // ordering the engine uses). Level 1 is the lowest tier; a referrer below it
  // is Level 0. Shown read-only so operators see the number the player gets.
  const rankByIndex: Record<number, number> = {};
  levels
    .map((_, i) => i)
    .sort((a, b) => (levels[a].activeReferrals || 0) - (levels[b].activeReferrals || 0))
    .forEach((origIdx, r) => {
      rankByIndex[origIdx] = r + 1;
    });
  const removeRow = (idx: number) => {
    rowIds.current = rowIds.current.filter((_, i) => i !== idx);
    onLevelsChange(levels.filter((_, i) => i !== idx));
  };
  return (
    <div className='space-y-4'>
      <Row>
        <Field label='Base metric' hint='Percent applies to the referee&apos;s monthly NGR (or GGR).'>
          <StyledSelect
            value={metric}
            onChange={(v) => onMetricChange(v as 'ngr' | 'ggr')}
            options={[
              { value: 'ngr', label: 'NGR (bets − wins − bonuses)' },
              { value: 'ggr', label: 'GGR (bets − wins)' },
            ]}
          />
        </Field>
        <Field label='Monthly cap (cents) per referral' hint='Optional. Empty = no cap.'>
          <input
            type='number'
            min={0}
            value={monthlyCapCents ?? ''}
            placeholder='0'
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) =>
              onCapChange(e.target.value === '' ? null : Number(e.target.value) || 0)
            }
            className='w-full text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary'
          />
        </Field>
      </Row>

      <div>
        <p className='text-xs font-medium text-gray-800 mb-2'>
          Crew tier table
        </p>
        <p className='text-[11px] text-gray-600 mb-3'>
          Referrer&apos;s earnings rate climbs as their active-crew count crosses each threshold.
          Below the lowest threshold the referrer earns nothing.
        </p>
        <div className='overflow-x-auto'>
          <table className='w-full text-sm'>
            <thead>
              <tr className='text-left text-[11px] uppercase tracking-wider text-gray-600 border-b border-gray-100'>
                <th className='py-2 pr-3'>Level</th>
                <th className='py-2 pr-3'>Tier name</th>
                <th className='py-2 pr-3'>Active referrals (≥)</th>
                <th className='py-2 pr-3'>Percent</th>
                <th className='py-2 w-10' />
              </tr>
            </thead>
            <tbody>
              {levels.map((lvl, idx) => (
                <tr key={rowIds.current[idx]} className='border-b border-gray-50 last:border-0'>
                  <td className='py-1.5 pr-3 text-gray-500 tabular-nums whitespace-nowrap'>
                    Level {rankByIndex[idx]}
                  </td>
                  <td className='py-1.5 pr-3'>
                    <input
                      type='text'
                      value={lvl.name ?? ''}
                      placeholder='e.g. Starter Crew'
                      onChange={(e) => updateRow(idx, { name: e.target.value })}
                      className='w-40 text-sm rounded-md px-2 py-1.5 border border-gray-200 focus:outline-none focus:border-primary'
                    />
                  </td>
                  <td className='py-1.5 pr-3'>
                    <NumberField
                      min={0}
                      value={lvl.activeReferrals}
                      onChange={(n) => updateRow(idx, { activeReferrals: n })}
                      className='w-28 text-sm rounded-md px-2 py-1.5 border border-gray-200 focus:outline-none focus:border-primary'
                    />
                  </td>
                  <td className='py-1.5 pr-3'>
                    <NumberField
                      min={0}
                      max={100}
                      step={0.5}
                      value={lvl.percent}
                      onChange={(n) => updateRow(idx, { percent: n })}
                      className='w-24 text-sm rounded-md px-2 py-1.5 border border-gray-200 focus:outline-none focus:border-primary'
                    />
                    <span className='text-xs text-gray-600 ml-1'>%</span>
                  </td>
                  <td className='py-1.5 text-right'>
                    <button
                      type='button'
                      onClick={() => removeRow(idx)}
                      disabled={levels.length <= 1}
                      className='text-xs text-red-600 hover:underline disabled:opacity-30 disabled:cursor-not-allowed'
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          type='button'
          onClick={addRow}
          className='mt-3 text-xs font-medium text-primary hover:text-primary-dark'
        >
          + Add tier
        </button>
      </div>
    </div>
  );
}
