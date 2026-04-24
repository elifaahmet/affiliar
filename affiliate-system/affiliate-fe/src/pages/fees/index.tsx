import { useState, FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useBaseQuery } from 'api/core/useBaseQuery';
import { baseService } from 'api/core/baseService';
import { FEES_API_URLS } from 'config/apiUrls';

interface ProviderRate {
  _id?: string;
  providerId: string;
  providerName: string;
  feePercent: number;
}

interface Settings {
  depositFeePercent: number;
  withdrawalFeePercent: number;
  jackpotFeePercent: number;
  casinoTaxPercent: number;
  defaults?: {
    revshareMetric: 'ngr' | 'ggr';
    ngrIncludesPaymentFees: boolean;
    depositBasis: 'gross' | 'net';
    minDepositCents: number | null;
    minWagerMultiple: number | null;
    minWagerCents: number | null;
    holdDays: number | null;
    minCashRetentionCents: number | null;
  };
}

interface Brand { _id: string; name: string }

// Scope sent to the API. "default" means the operator-wide row (brandId=null
// server-side). Any other value is a specific Brand._id.
type Scope = 'default' | string;

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className='bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden'>
      <div className='px-5 py-3 border-b border-gray-100'>
        <p className='text-sm font-semibold text-gray-800'>{title}</p>
      </div>
      <div className='p-5'>{children}</div>
    </div>
  );
}

function SettingsForm({ scope }: { scope: Scope }) {
  const qc = useQueryClient();
  const { data, isLoading } = useBaseQuery<{ settings: Settings }>({
    endpoint: FEES_API_URLS.SETTINGS(),
    queryKey: ['fees-settings', scope],
    params: { brandId: scope },
  });
  const s = data?.settings;
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    const form = new FormData(e.currentTarget);
    try {
      // Blank gate inputs stay null (inherit disabled). Dollar fields
      // convert to cents before submit.
      const gateFromCents = (name: string) => {
        const v = form.get(name);
        if (v == null || v === '') return null;
        const n = Number(v);
        return Number.isFinite(n) ? Math.round(n * 100) : null;
      };
      const gateNumber = (name: string) => {
        const v = form.get(name);
        if (v == null || v === '') return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      };

      await baseService.update(FEES_API_URLS.SETTINGS(), {
        brandId: scope,
        depositFeePercent: Number(form.get('deposit') ?? 0),
        withdrawalFeePercent: Number(form.get('withdrawal') ?? 0),
        jackpotFeePercent: Number(form.get('jackpot') ?? 0),
        casinoTaxPercent: Number(form.get('tax') ?? 0),
        // Defaults only make sense at operator-wide scope; the payload is
        // still safe to send for brand scopes (server stores it but no
        // consumer reads brand-scoped defaults today).
        defaults: {
          revshareMetric: String(form.get('revshareMetric') ?? 'ngr'),
          ngrIncludesPaymentFees: form.get('ngrIncludesPaymentFees') === 'true',
          depositBasis: String(form.get('depositBasis') ?? 'gross'),
          minDepositCents:       gateFromCents('minDeposit'),
          minWagerCents:         gateFromCents('minWager'),
          minWagerMultiple:      gateNumber('minWagerMultiple'),
          holdDays:              gateNumber('holdDays'),
          minCashRetentionCents: gateFromCents('minCashRetention'),
        },
      });
      qc.invalidateQueries({ queryKey: ['fees-settings', scope] });
    } catch (e2: any) {
      setErr(e2?.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <p className='text-sm text-gray-400'>Loading...</p>;

  return (
    <form key={scope} onSubmit={onSubmit} className='space-y-4'>
      <p className='text-xs text-gray-500'>
        Flat percentages applied by the daily fees job
        {scope === 'default' ? ' (operator default)' : ' (brand override)'}.
        Leave at 0 if you're publishing pre-aggregated fees yourself.
      </p>
      <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4'>
        <NumberInput label='Deposit Fee %'    name='deposit'    defaultValue={s?.depositFeePercent ?? 0}    hint='% of deposits (processor cost)' />
        <NumberInput label='Withdrawal Fee %' name='withdrawal' defaultValue={s?.withdrawalFeePercent ?? 0} hint='% of cashouts (processor cost)' />
        <NumberInput label='Jackpot %'        name='jackpot'    defaultValue={s?.jackpotFeePercent ?? 0}    hint='% of bets' />
        <NumberInput label='Casino Tax %'     name='tax'        defaultValue={s?.casinoTaxPercent ?? 0}     hint='% of GGR' />
      </div>

      {scope === 'default' && (
        <div className='border-t pt-4 space-y-3'>
          <div>
            <p className='text-xs font-semibold text-gray-700'>Commission defaults</p>
            <p className='text-xs text-gray-500 mt-0.5'>
              Applied to any commission plan that leaves the matching field
              on <em>Inherit from operator default</em>. Plans can still
              override per-plan.
            </p>
          </div>
          <div className='grid grid-cols-1 sm:grid-cols-3 gap-4'>
            <SelectInput
              key={`rm-${scope}`}
              label='Revshare metric'
              name='revshareMetric'
              defaultValue={s?.defaults?.revshareMetric ?? 'ngr'}
              options={[
                { value: 'ngr', label: 'NGR (standard)' },
                { value: 'ggr', label: 'GGR (pre-deduction)' },
              ]}
              hint='Base for % revshare plans'
            />
            <SelectInput
              key={`ip-${scope}`}
              label='NGR includes payment fees'
              name='ngrIncludesPaymentFees'
              defaultValue={String(s?.defaults?.ngrIncludesPaymentFees ?? true)}
              options={[
                { value: 'true',  label: 'Yes — subtract (standard)' },
                { value: 'false', label: 'No — gross NGR (operator carries fees)' },
              ]}
              hint='Affects NGR-based commission base'
            />
            <SelectInput
              key={`db-${scope}`}
              label='Deposit basis (CPA)'
              name='depositBasis'
              defaultValue={s?.defaults?.depositBasis ?? 'gross'}
              options={[
                { value: 'gross', label: 'Gross (face value)' },
                { value: 'net',   label: 'Net (after processor fee)' },
              ]}
              hint='Used by CPA qualification gates'
            />
          </div>

          <div>
            <p className='text-xs font-semibold text-gray-700 mt-4'>CPA qualification gates</p>
            <p className='text-xs text-gray-500 mt-0.5'>
              Operator-wide defaults. Blank = gate not enforced. Individual
              plans can override (or leave blank to inherit).
            </p>
          </div>
          <div className='grid grid-cols-2 sm:grid-cols-3 gap-4'>
            <GateInput
              key={`md-${scope}`}
              label='Min deposit ($)'
              name='minDeposit'
              defaultValue={s?.defaults?.minDepositCents}
              fromCents
            />
            <GateInput
              key={`mw-${scope}`}
              label='Min wager ($)'
              name='minWager'
              defaultValue={s?.defaults?.minWagerCents}
              fromCents
            />
            <GateInput
              key={`mwm-${scope}`}
              label='Min wager × deposit'
              name='minWagerMultiple'
              defaultValue={s?.defaults?.minWagerMultiple}
              step={0.1}
            />
            <GateInput
              key={`hd-${scope}`}
              label='Hold period (days)'
              name='holdDays'
              defaultValue={s?.defaults?.holdDays}
            />
            <GateInput
              key={`cr-${scope}`}
              label='Min net cash retained ($)'
              name='minCashRetention'
              defaultValue={s?.defaults?.minCashRetentionCents}
              fromCents
            />
          </div>
        </div>
      )}
      {err && <p className='text-sm text-red-500'>{err}</p>}
      <button
        type='submit'
        disabled={saving}
        className='bg-primary text-white px-4 py-2 rounded text-sm font-semibold hover:bg-primary-dark disabled:opacity-50'
      >
        {saving ? 'Saving...' : 'Save'}
      </button>
    </form>
  );
}

function NumberInput({ label, name, defaultValue, hint }: {
  label: string; name: string; defaultValue: number; hint?: string;
}) {
  return (
    <label className='flex flex-col gap-1'>
      <span className='text-xs font-medium text-gray-700'>{label}</span>
      <input
        type='number'
        name={name}
        min={0}
        max={100}
        step={0.01}
        defaultValue={defaultValue}
        className='border border-gray-200 rounded px-3 py-2 text-sm'
      />
      {hint && <span className='text-xs text-gray-400'>{hint}</span>}
    </label>
  );
}

function GateInput({ label, name, defaultValue, fromCents, step }: {
  label: string;
  name: string;
  defaultValue: number | null | undefined;
  fromCents?: boolean;
  step?: number;
}) {
  const display =
    defaultValue == null
      ? ''
      : fromCents
        ? String(defaultValue / 100)
        : String(defaultValue);
  return (
    <label className='flex flex-col gap-1'>
      <span className='text-xs font-medium text-gray-700'>{label}</span>
      <input
        type='number'
        name={name}
        min={0}
        step={step ?? 1}
        defaultValue={display}
        placeholder='Disabled'
        className='border border-gray-200 rounded px-3 py-2 text-sm'
      />
    </label>
  );
}

function SelectInput({ label, name, defaultValue, options, hint }: {
  label: string;
  name: string;
  defaultValue: string;
  options: { value: string; label: string }[];
  hint?: string;
}) {
  return (
    <label className='flex flex-col gap-1'>
      <span className='text-xs font-medium text-gray-700'>{label}</span>
      <select
        name={name}
        defaultValue={defaultValue}
        className='border border-gray-200 rounded px-3 py-2 text-sm bg-white'
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {hint && <span className='text-xs text-gray-400'>{hint}</span>}
    </label>
  );
}

function ProviderRatesTable({ scope }: { scope: Scope }) {
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useBaseQuery<{ rates: ProviderRate[] }>({
    endpoint: FEES_API_URLS.PROVIDER_RATES(),
    queryKey: ['fees-provider-rates', scope],
    params: { brandId: scope },
  });
  const rates = data?.rates ?? [];
  const [editing, setEditing] = useState<Partial<ProviderRate>>({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (!editing.providerId) return;
    setSaving(true);
    setErr(null);
    try {
      await baseService.update(FEES_API_URLS.PROVIDER_RATES(), {
        brandId: scope,
        providerId: editing.providerId.trim(),
        providerName: editing.providerName?.trim() ?? '',
        feePercent: Number(editing.feePercent ?? 0),
      });
      setEditing({});
      refetch();
      qc.invalidateQueries({ queryKey: ['fees-provider-rates', scope] });
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (providerId: string) => {
    if (!confirm(`Delete rate for ${providerId}?`)) return;
    await baseService.delete(
      `${FEES_API_URLS.PROVIDER_RATE(providerId)}?brandId=${encodeURIComponent(scope)}`,
      0,
    );
    refetch();
  };

  return (
    <div className='space-y-4'>
      <p className='text-xs text-gray-500'>
        Per-provider revenue share (% of provider GGR). Providers not listed
        contribute 0% — i.e. no <code>game_provider_fees</code> deduction.
        {scope !== 'default' && (
          <span className='block mt-1'>
            Overrides the operator-default rate for this brand only.
          </span>
        )}
      </p>

      {isLoading && <p className='text-sm text-gray-400'>Loading...</p>}

      {!isLoading && (
        <div className='overflow-x-auto'>
          <table className='w-full'>
            <thead className='bg-gray-50'>
              <tr>
                <th className='px-4 py-2 text-left text-xs font-semibold text-gray-500'>Provider ID</th>
                <th className='px-4 py-2 text-left text-xs font-semibold text-gray-500'>Display Name</th>
                <th className='px-4 py-2 text-right text-xs font-semibold text-gray-500'>Fee %</th>
                <th className='px-4 py-2 text-right text-xs font-semibold text-gray-500'></th>
              </tr>
            </thead>
            <tbody className='divide-y divide-gray-100'>
              {rates.map((r) => (
                <tr key={r.providerId}>
                  <td className='px-4 py-2 text-xs font-mono text-gray-700'>{r.providerId}</td>
                  <td className='px-4 py-2 text-xs text-gray-700'>{r.providerName || '—'}</td>
                  <td className='px-4 py-2 text-xs text-right text-gray-700'>{r.feePercent}%</td>
                  <td className='px-4 py-2 text-xs text-right'>
                    <button
                      onClick={() => setEditing(r)}
                      className='text-blue-600 hover:underline mr-3'
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => remove(r.providerId)}
                      className='text-red-600 hover:underline'
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {rates.length === 0 && (
                <tr>
                  <td colSpan={4} className='px-4 py-6 text-center text-sm text-gray-400'>
                    No provider rates configured for this scope.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className='border-t pt-4'>
        <p className='text-xs font-semibold text-gray-700 mb-2'>
          {editing._id ? 'Edit rate' : 'Add new rate'}
        </p>
        <div className='grid grid-cols-1 sm:grid-cols-4 gap-3 items-end'>
          <label className='flex flex-col gap-1'>
            <span className='text-xs text-gray-600'>Provider ID</span>
            <input
              type='text'
              value={editing.providerId ?? ''}
              onChange={(e) => setEditing({ ...editing, providerId: e.target.value })}
              placeholder='coco-gamings'
              className='border border-gray-200 rounded px-3 py-2 text-sm'
            />
          </label>
          <label className='flex flex-col gap-1'>
            <span className='text-xs text-gray-600'>Display name</span>
            <input
              type='text'
              value={editing.providerName ?? ''}
              onChange={(e) => setEditing({ ...editing, providerName: e.target.value })}
              placeholder='Coco Gamings'
              className='border border-gray-200 rounded px-3 py-2 text-sm'
            />
          </label>
          <label className='flex flex-col gap-1'>
            <span className='text-xs text-gray-600'>Fee %</span>
            <input
              type='number'
              value={editing.feePercent ?? ''}
              onChange={(e) => setEditing({ ...editing, feePercent: Number(e.target.value) })}
              min={0}
              max={100}
              step={0.01}
              className='border border-gray-200 rounded px-3 py-2 text-sm'
            />
          </label>
          <div className='flex gap-2'>
            <button
              onClick={save}
              disabled={saving || !editing.providerId}
              className='bg-primary text-white px-4 py-2 rounded text-sm font-semibold hover:bg-primary-dark disabled:opacity-50 flex-1'
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            {editing.providerId && (
              <button
                onClick={() => setEditing({})}
                className='border border-gray-200 text-gray-700 px-3 py-2 rounded text-sm'
              >
                Cancel
              </button>
            )}
          </div>
        </div>
        {err && <p className='text-xs text-red-500 mt-2'>{err}</p>}
      </div>
    </div>
  );
}

function RunFeesButton() {
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const qc = useQueryClient();

  const run = async (dayOffset: number, label: string) => {
    setRunning(true);
    setMsg(null);
    try {
      await baseService.add(FEES_API_URLS.RUN(), { dayOffset });
      setMsg(`Job triggered for ${label}.`);
      qc.invalidateQueries();
    } catch (e: any) {
      setMsg(e?.message ?? 'Failed to run');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className='flex flex-wrap items-center gap-3'>
      <button
        onClick={() => run(-1, 'yesterday')}
        disabled={running}
        className='bg-primary text-white px-4 py-2 rounded text-sm font-semibold hover:bg-primary-dark disabled:opacity-50'
      >
        {running ? 'Running...' : 'Run for yesterday'}
      </button>
      <button
        onClick={() => run(0, 'today')}
        disabled={running}
        className='border border-primary text-primary px-4 py-2 rounded text-sm font-semibold hover:bg-gray-50 disabled:opacity-50'
      >
        Run for today (test)
      </button>
      {msg && <p className='text-xs text-gray-600'>{msg}</p>}
    </div>
  );
}

function ScopeSelector({ scope, setScope }: { scope: Scope; setScope: (s: Scope) => void }) {
  const { data } = useBaseQuery<{ brands: Brand[] }>({
    endpoint: FEES_API_URLS.BRANDS(),
    queryKey: ['fees-brands'],
  });
  const brands = data?.brands ?? [];

  return (
    <div className='flex flex-wrap gap-2 items-center'>
      <span className='text-xs font-semibold text-gray-600 uppercase tracking-wider mr-2'>Scope:</span>
      <button
        onClick={() => setScope('default')}
        className={`px-3 py-1.5 rounded text-xs font-semibold ${
          scope === 'default'
            ? 'bg-primary text-white'
            : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
        }`}
      >
        Operator default
      </button>
      {brands.map((b) => (
        <button
          key={b._id}
          onClick={() => setScope(b._id)}
          className={`px-3 py-1.5 rounded text-xs font-semibold ${
            scope === b._id
              ? 'bg-primary text-white'
              : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
          }`}
        >
          {b.name}
        </button>
      ))}
    </div>
  );
}

export default function FeesPage() {
  const [scope, setScope] = useState<Scope>('default');

  return (
    <div className='bg-gray-100 h-full overflow-auto p-6 pb-24 space-y-6'>
      <div className='bg-amber-50 border-2 border-amber-400 rounded-xl p-4 flex gap-3 items-start'>
        <span className='text-amber-600 text-xl leading-none'>⚠️</span>
        <div>
          <p className='text-sm font-bold text-amber-900 mb-1'>
            Per category, pick one source of fees — don't do both.
          </p>
          <p className='text-sm text-amber-900'>
            Each fee category (deposit, withdrawal, jackpot, casino tax, game
            provider) is independent. For each one, either{' '}
            <b>configure the percentage here and let Affiliar compute it</b>,{' '}
            or <b>publish the value yourself</b> — either as{' '}
            <code className='bg-amber-100 px-1 rounded'>feeCents</code>{' '}on
            individual deposit/withdrawal events, or as a batch in{' '}
            <code className='bg-amber-100 px-1 rounded'>fees.daily.adjustment</code>{' '}
            events.
          </p>
          <p className='text-sm text-amber-900 mt-1'>
            Per-event fees win: if an event carries{' '}
            <code className='bg-amber-100 px-1 rounded'>feeCents</code>, the
            cron skips that transaction. Doing both for the <b>same category</b>{' '}
            at the aggregate level (cron + daily adjustment event) will double-
            count. Mixing categories is fine.
          </p>
        </div>
      </div>

      <ScopeSelector scope={scope} setScope={setScope} />

      <Card title='Operator-wide fees'>
        <SettingsForm scope={scope} />
      </Card>
      <Card title='Provider fees'>
        <ProviderRatesTable scope={scope} />
      </Card>
      <Card title='Manual run'>
        <p className='text-xs text-gray-500 mb-3'>
          Re-runs the fees job for yesterday (idempotent — SummingMergeTree
          merges duplicates by source_event_id).
        </p>
        <RunFeesButton />
      </Card>
    </div>
  );
}
