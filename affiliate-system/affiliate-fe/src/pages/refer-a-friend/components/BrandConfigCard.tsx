import { useState } from 'react';
import { useBaseMutation } from 'api/core/useBaseMutation';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronDownIcon, KeyIcon, BoltIcon } from '@heroicons/react/24/outline';
import { REFER_API_URLS } from 'config/apiUrls';

import StyledSelect from '@components/core-components/StyledSelect';
import type { Brand, ReferConfig } from '../types';
import DeliveriesPanel from './DeliveriesPanel';

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
  },
  caps: {
    perReferrerMonthlyCents: 0,
    perBrandMonthlyCents: 0,
  },
  webhook: {
    url: '',
    enabled: false,
    secretPresent: false,
  },
};

export default function BrandConfigCard({ brand, existingConfig, onSaved }: Props) {
  const queryClient = useQueryClient();
  const [open, setOpen]   = useState(!!existingConfig?.enabled);
  const [form, setForm]   = useState<Omit<ReferConfig, 'brandId'>>(() => ({
    ...DEFAULT_CONFIG,
    ...(existingConfig ?? {}),
    reward:          { ...DEFAULT_CONFIG.reward,          ...(existingConfig?.reward ?? {}) },
    refereeReward:   { ...DEFAULT_CONFIG.refereeReward,   ...(existingConfig?.refereeReward ?? {}) },
    recurringReward: { ...DEFAULT_CONFIG.recurringReward, ...(existingConfig?.recurringReward ?? {}) },
    qualification:   { ...DEFAULT_CONFIG.qualification,   ...(existingConfig?.qualification ?? {}) },
    caps:          { ...DEFAULT_CONFIG.caps,          ...(existingConfig?.caps ?? {}) },
    webhook:       { ...DEFAULT_CONFIG.webhook,       ...(existingConfig?.webhook ?? {}) },
  }));
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const upsert = useBaseMutation({
    endpoint: REFER_API_URLS.CONFIG(brand._id),
    method: 'update',
    onSuccess: () => {
      setSavedNotice('Saved.');
      setTimeout(() => setSavedNotice(null), 2200);
      queryClient.invalidateQueries({ queryKey: ['refer-configs'] });
      onSaved();
    },
  });

  const rotateSecret = useBaseMutation({
    endpoint: REFER_API_URLS.ROTATE_SECRET(brand._id),
    method: 'post',
    onSuccess: (data: any) => {
      if (data?.signingSecret) setRevealedSecret(data.signingSecret);
      queryClient.invalidateQueries({ queryKey: ['refer-configs'] });
    },
  });

  const sendTest = useBaseMutation({
    endpoint: REFER_API_URLS.TEST_EVENT(brand._id),
    method: 'post',
    onSuccess: () => {
      setSavedNotice('Test event queued.');
      setTimeout(() => setSavedNotice(null), 2200);
      queryClient.invalidateQueries({ queryKey: ['refer-deliveries', brand._id] });
    },
  });

  function handleSave() {
    upsert.mutate({
      enabled: form.enabled,
      reward: form.reward,
      refereeReward: form.refereeReward,
      recurringReward: form.recurringReward,
      qualification: form.qualification,
      caps: form.caps,
      webhook: { url: form.webhook.url, enabled: form.webhook.enabled },
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
  function setWebhook<K extends keyof ReferConfig['webhook']>(key: K, value: ReferConfig['webhook'][K]) {
    setForm((f) => ({ ...f, webhook: { ...f.webhook, [key]: value } }));
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
            <p className='text-xs text-gray-500'>
              {form.enabled ? 'Active' : 'Disabled'}
              {form.webhook.secretPresent ? ' · Webhook secret set' : ' · No secret yet'}
            </p>
          </div>
        </div>
        <ChevronDownIcon className={`h-4 w-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className='border-t border-violet-100 p-5 space-y-6'>
          {/* Master toggle */}
          <div className='flex items-center justify-between gap-4 p-3 rounded-lg bg-violet-50/40'>
            <div>
              <p className='text-sm font-medium text-gray-900'>Enable Refer-a-Friend for this brand</p>
              <p className='text-xs text-gray-500'>New track-signup calls are accepted only when enabled. In-flight referrals continue regardless.</p>
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
                    value={form.reward.amountCents}
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
                    value={form.reward.percent}
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
          </Section>

          {/* Referee reward (Phase 2 two-sided rewards) */}
          <Section title='Referee reward' hint='Optional welcome bonus paid to the friend at the same time the referrer is rewarded. Currency inherits from the main reward.'>
            <div className='flex items-center justify-between gap-4 p-3 rounded-lg bg-violet-50/40'>
              <div>
                <p className='text-sm font-medium text-gray-900'>Pay the friend too</p>
                <p className='text-xs text-gray-500'>
                  Fires <code className='text-[11px] font-mono'>referral.reward.referee.issued</code> webhook on qualification.
                  Operator must handle the new event type to credit the friend.
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
                        value={form.refereeReward.amountCents}
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
                        value={form.refereeReward.percent}
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

          {/* Recurring referrer reward (Phase 2 Step 4) */}
          <Section title='Recurring referrer reward' hint='Optional ongoing % of the friend’s monthly NGR/GGR. Pays once per calendar month for as long as the referral stays active.'>
            <div className='flex items-center justify-between gap-4 p-3 rounded-lg bg-violet-50/40'>
              <div>
                <p className='text-sm font-medium text-gray-900'>Pay the referrer monthly</p>
                <p className='text-xs text-gray-500'>
                  Fires <code className='text-[11px] font-mono'>referral.reward.recurring.issued</code> webhook on day 5 of each month for the previous month. Stops automatically when the friend's FTD is reversed (past payments stay).
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
                      value={form.recurringReward.percent}
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

          {/* Qualification */}
          <Section title='Qualification gates'>
            <Row>
              <Field label='Min deposit (cents)' hint='Below this → rejected'>
                <input
                  type='number' min={0}
                  value={form.qualification.minDepositCents}
                  onChange={(e) => setQual('minDepositCents', Number(e.target.value) || 0)}
                  className='w-full text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary'
                />
              </Field>
              <Field label='Hold period (days)' hint='Wait N days after FTD before paying'>
                <input
                  type='number' min={0}
                  value={form.qualification.holdDays}
                  onChange={(e) => setQual('holdDays', Number(e.target.value) || 0)}
                  className='w-full text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary'
                />
              </Field>
            </Row>
            <Row>
              <Field label='Min wager (cents)' hint='Flat wager floor; 0 = none'>
                <input
                  type='number' min={0}
                  value={form.qualification.minWagerCents}
                  onChange={(e) => setQual('minWagerCents', Number(e.target.value) || 0)}
                  className='w-full text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary'
                />
              </Field>
              <Field label='Min wager × FTD' hint='e.g. 3 → wager 3× the FTD amount'>
                <input
                  type='number' min={0}
                  value={form.qualification.minWagerMultiple}
                  onChange={(e) => setQual('minWagerMultiple', Number(e.target.value) || 0)}
                  className='w-full text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary'
                />
              </Field>
            </Row>
          </Section>

          {/* Caps */}
          <Section title='Monthly spend caps' hint='0 = no cap'>
            <Row>
              <Field label='Per referrer (cents)'>
                <input
                  type='number' min={0}
                  value={form.caps.perReferrerMonthlyCents}
                  onChange={(e) => setCap('perReferrerMonthlyCents', Number(e.target.value) || 0)}
                  className='w-full text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary'
                />
              </Field>
              <Field label='Per brand (cents)'>
                <input
                  type='number' min={0}
                  value={form.caps.perBrandMonthlyCents}
                  onChange={(e) => setCap('perBrandMonthlyCents', Number(e.target.value) || 0)}
                  className='w-full text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary'
                />
              </Field>
            </Row>
          </Section>

          {/* Webhook */}
          <Section title='Webhook' hint='Affiliar POSTs reward.issued / reward.reversed events here'>
            <Row>
              <Field label='Webhook URL' wide>
                <input
                  type='url'
                  value={form.webhook.url ?? ''}
                  onChange={(e) => setWebhook('url', e.target.value)}
                  placeholder='https://api.your-casino.com/internal/affiliar-rewards'
                  className='w-full text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary'
                />
              </Field>
            </Row>

            <div className='flex items-center justify-between gap-4 p-3 rounded-lg bg-violet-50/40'>
              <div>
                <p className='text-sm font-medium text-gray-900'>Webhook delivery enabled</p>
                <p className='text-xs text-gray-500'>Pause to halt new deliveries without losing pending events.</p>
              </div>
              <input
                type='checkbox'
                checked={form.webhook.enabled}
                onChange={(e) => setWebhook('enabled', e.target.checked)}
                className='h-5 w-5 rounded accent-primary cursor-pointer'
              />
            </div>

            <div className='flex flex-wrap gap-2 items-center'>
              <button
                type='button'
                onClick={() => rotateSecret.mutate({})}
                disabled={rotateSecret.isPending}
                className='inline-flex items-center gap-2 h-9 px-4 rounded-lg border border-violet-200 text-sm font-medium text-violet-800 hover:bg-violet-50 disabled:opacity-60'
              >
                <KeyIcon className='h-4 w-4' />
                {form.webhook.secretPresent ? 'Rotate signing secret' : 'Generate signing secret'}
              </button>
              <button
                type='button'
                onClick={() => sendTest.mutate({})}
                disabled={sendTest.isPending || !form.webhook.url || !form.webhook.secretPresent}
                title={
                  !form.webhook.url
                    ? 'Set a webhook URL first'
                    : !form.webhook.secretPresent
                      ? 'Generate a signing secret first'
                      : ''
                }
                className='inline-flex items-center gap-2 h-9 px-4 rounded-lg border border-violet-200 text-sm font-medium text-violet-800 hover:bg-violet-50 disabled:opacity-60'
              >
                <BoltIcon className='h-4 w-4' />
                Send test event
              </button>
            </div>

            {revealedSecret && (
              <div className='mt-2 p-3 rounded-lg border border-amber-200 bg-amber-50 text-xs space-y-2'>
                <p className='font-semibold text-amber-900'>Save this secret now. It will not be shown again.</p>
                <code className='block break-all bg-white p-2 rounded border border-amber-200 font-mono text-amber-900'>
                  {revealedSecret}
                </code>
                <button
                  type='button'
                  onClick={() => setRevealedSecret(null)}
                  className='text-xs font-medium text-amber-900 underline'
                >
                  I've saved it, dismiss
                </button>
              </div>
            )}
          </Section>

          {/* Deliveries panel */}
          <DeliveriesPanel brandId={brand._id} />

          {/* Save */}
          <div className='flex items-center gap-3 pt-2 border-t border-violet-100'>
            <button
              type='button'
              onClick={handleSave}
              disabled={upsert.isPending}
              className='h-9 px-5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-dark disabled:opacity-60'
            >
              {upsert.isPending ? 'Saving…' : 'Save changes'}
            </button>
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
        {hint && <p className='text-xs text-gray-500 mt-0.5'>{hint}</p>}
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
      {hint && <p className='text-[11px] text-gray-400 mt-1'>{hint}</p>}
    </div>
  );
}
