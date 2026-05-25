import { useMemo, useRef, useState, FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useBaseQuery } from 'api/core/useBaseQuery';
import { baseService } from 'api/core/baseService';
import { FEES_API_URLS } from 'config/apiUrls';
import { parseCsv, buildCsv, downloadCsv, readFileAsText } from 'utils/csv';
import { useOperatorPlan } from 'hooks/useOperatorPlan';

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
  sbThirdPartyFeePercent: number;
  customNgrFeePercent: number;
  customDepositFeePercent: number;
  alwaysDeductCustomFees: boolean;
  defaults?: {
    revshareMetric: 'ngr' | 'ggr';
    ngrIncludesPaymentFees: boolean;
    depositBasis: 'gross' | 'net';
    minDepositCents: number | null;
    minWagerMultiple: number | null;
    minWagerCents: number | null;
    holdDays: number | null;
    minCashRetentionCents: number | null;
    minKycLevel: number | null;
  };
}

interface Brand { _id: string; name: string }

// Scope sent to the API. "default" means the operator-wide row (brandId=null
// server-side). Any other value is a specific Brand._id.
type Scope = 'default' | string;

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className='bg-white/80 backdrop-blur-sm rounded-xl border border-violet-100 overflow-hidden'>
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
  const { limits } = useOperatorPlan();
  // Plan-gated: when the operator's plan doesn't unlock Custom NGR / Custom
  // Deposit % the inputs render disabled with an upgrade hint. The BE
  // double-checks too (feesController.updateFinancialSettings) so a stale
  // FE can't sneak the field in.
  const customFeesEnabled = limits ? limits.customFees : true;
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    const form = new FormData(e.currentTarget);
    try {
      await baseService.update(FEES_API_URLS.SETTINGS(), {
        brandId: scope,
        depositFeePercent:       Number(form.get('deposit') ?? 0),
        withdrawalFeePercent:    Number(form.get('withdrawal') ?? 0),
        jackpotFeePercent:       Number(form.get('jackpot') ?? 0),
        casinoTaxPercent:        Number(form.get('tax') ?? 0),
        sbThirdPartyFeePercent:  Number(form.get('sbThirdParty') ?? 0),
        customNgrFeePercent:     Number(form.get('customNgr') ?? 0),
        customDepositFeePercent: Number(form.get('customDeposit') ?? 0),
        alwaysDeductCustomFees:  form.get('alwaysDeductCustom') === 'on',
      });
      qc.invalidateQueries({ queryKey: ['fees-settings', scope] });
      setDirty(false);
    } catch (e2: any) {
      setErr(e2?.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <p className='text-sm text-gray-600'>Loading...</p>;

  return (
    <form
      key={scope}
      onSubmit={onSubmit}
      onChange={() => { if (!dirty) setDirty(true); }}
      className='space-y-4'
    >
      <p className='text-xs text-gray-700'>
        Flat percentages applied by the daily fees job
        {scope === 'default' ? ' (operator default)' : ' (brand override)'}.
        Leave at 0 if you're publishing pre-aggregated fees yourself.
      </p>
      <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4'>
        <NumberInput label='Deposit Fee %'    name='deposit'       defaultValue={s?.depositFeePercent ?? 0}       hint='% of deposits (processor cost)' />
        <NumberInput label='Withdrawal Fee %' name='withdrawal'    defaultValue={s?.withdrawalFeePercent ?? 0}    hint='% of cashouts (processor cost)' />
        <NumberInput label='Jackpot %'        name='jackpot'       defaultValue={s?.jackpotFeePercent ?? 0}       hint='% of casino bets' />
        <NumberInput label='Casino Tax %'     name='tax'           defaultValue={s?.casinoTaxPercent ?? 0}        hint='% of casino GGR' />
        <NumberInput label='SB 3rd-party %'   name='sbThirdParty'  defaultValue={s?.sbThirdPartyFeePercent ?? 0}  hint='% of sportsbook GGR (bookmaker/data-feed)' />
        <NumberInput label='Custom NGR %'     name='customNgr'     defaultValue={s?.customNgrFeePercent ?? 0}     hint='% of combined GGR — extra deduction from NGR'
                     disabled={!customFeesEnabled} lockedHint='Upgrade to Affiliate Plus to enable' />
        <NumberInput label='Custom Deposit %' name='customDeposit' defaultValue={s?.customDepositFeePercent ?? 0} hint='% of deposits — extra deduction from NGR'
                     disabled={!customFeesEnabled} lockedHint='Upgrade to Affiliate Plus to enable' />
      </div>
      <label
        key={`adcf-${scope}-${s?.alwaysDeductCustomFees ? '1' : '0'}`}
        className='flex items-start gap-2 text-xs text-gray-700 pt-1'
      >
        <input
          type='checkbox'
          name='alwaysDeductCustom'
          defaultChecked={!!s?.alwaysDeductCustomFees}
          disabled={!customFeesEnabled}
          className='mt-0.5 disabled:cursor-not-allowed'
        />
        <span>
          <b>Always deduct custom fees.</b>{' '}
          When on, Custom NGR % and Custom Deposit % are applied every day —
          even on buckets where you also publish{' '}
          <code className='bg-gray-100 px-1 rounded'>additionalDeductionsCents</code>{' '}
          via events. When off (default), the daily job defers to your
          published value and skips its own custom computation for that bucket
          to avoid double-counting.
        </span>
      </label>
      {err && <p className='text-sm text-red-500'>{err}</p>}
      <div className='flex items-center gap-3'>
        <button
          type='submit'
          disabled={saving || !dirty}
          className='bg-primary text-white px-4 py-2 rounded text-sm font-semibold hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed'
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
        {!dirty && !saving && (
          <span className='text-xs text-gray-700'>No pending changes</span>
        )}
      </div>
    </form>
  );
}

function CommissionDefaultsForm() {
  const qc = useQueryClient();
  const { limits } = useOperatorPlan();
  // KYC qualification gate is a plan feature; lock the input + null it out
  // on save when the plan doesn't allow it (BE rejects too).
  const kycEnabled = limits ? limits.kycGate : true;
  const { data, isLoading } = useBaseQuery<{ settings: Settings }>({
    endpoint: FEES_API_URLS.SETTINGS(),
    queryKey: ['fees-settings', 'default'],
    params: { brandId: 'default' },
  });
  const s = data?.settings;
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    const form = new FormData(e.currentTarget);
    try {
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
      const kycVal = form.get('minKycLevel');
      const minKycLevel =
        kycVal == null || kycVal === '' || kycVal === 'null'
          ? null
          : Number(kycVal);

      await baseService.update(FEES_API_URLS.SETTINGS(), {
        brandId: 'default',
        defaults: {
          revshareMetric: String(form.get('revshareMetric') ?? 'ngr'),
          ngrIncludesPaymentFees: form.get('ngrIncludesPaymentFees') === 'true',
          depositBasis: String(form.get('depositBasis') ?? 'gross'),
          minDepositCents:       gateFromCents('minDeposit'),
          minWagerCents:         gateFromCents('minWager'),
          minWagerMultiple:      gateNumber('minWagerMultiple'),
          holdDays:              gateNumber('holdDays'),
          minCashRetentionCents: gateFromCents('minCashRetention'),
          minKycLevel,
        },
      });
      qc.invalidateQueries({ queryKey: ['fees-settings', 'default'] });
      setDirty(false);
    } catch (e2: any) {
      setErr(e2?.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <p className='text-sm text-gray-600'>Loading...</p>;

  return (
    <form
      onSubmit={onSubmit}
      onChange={() => { if (!dirty) setDirty(true); }}
      className='space-y-4'
    >
      <p className='text-xs text-gray-700'>
        Applied to any commission plan that leaves the matching field on{' '}
        <em>Inherit from operator default</em>. Plans can still override per-plan.
      </p>
      <div className='grid grid-cols-1 sm:grid-cols-3 gap-4'>
        <SelectInput
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

      <div className='border-t pt-4'>
        <p className='text-xs font-semibold text-gray-700'>CPA qualification gates</p>
        <p className='text-xs text-gray-700 mt-0.5'>
          Operator-wide defaults. Blank = gate not enforced. Individual plans
          can override (or leave blank to inherit).
        </p>
      </div>
      <div className='grid grid-cols-2 sm:grid-cols-3 gap-4'>
        <GateInput label='Min deposit ($)'             name='minDeposit'       defaultValue={s?.defaults?.minDepositCents}        fromCents />
        <GateInput label='Min wager ($)'               name='minWager'         defaultValue={s?.defaults?.minWagerCents}          fromCents />
        <GateInput label='Min wager × deposit'         name='minWagerMultiple' defaultValue={s?.defaults?.minWagerMultiple}       step={0.1} />
        <GateInput label='Hold period (days)'          name='holdDays'         defaultValue={s?.defaults?.holdDays} />
        <GateInput label='Min net cash retained ($)'   name='minCashRetention' defaultValue={s?.defaults?.minCashRetentionCents}  fromCents />
        <KycLevelSelect
          label='Min KYC level'
          name='minKycLevel'
          defaultValue={s?.defaults?.minKycLevel}
          disabled={!kycEnabled}
          lockedHint='Upgrade to Affiliate Plus to enable'
        />
      </div>

      {err && <p className='text-sm text-red-500'>{err}</p>}
      <div className='flex items-center gap-3'>
        <button
          type='submit'
          disabled={saving || !dirty}
          className='bg-primary text-white px-4 py-2 rounded text-sm font-semibold hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed'
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
        {!dirty && !saving && (
          <span className='text-xs text-gray-700'>No pending changes</span>
        )}
      </div>
    </form>
  );
}

function NumberInput({ label, name, defaultValue, hint, disabled, lockedHint }: {
  label: string; name: string; defaultValue: number; hint?: string;
  disabled?: boolean; lockedHint?: string;
}) {
  return (
    <label className={`flex flex-col gap-1 ${disabled ? 'opacity-60' : ''}`}>
      <span className='text-xs font-medium text-gray-700'>{label}</span>
      <input
        type='number'
        name={name}
        min={0}
        max={100}
        step={0.01}
        defaultValue={defaultValue}
        disabled={disabled}
        className='border border-gray-200 rounded px-3 py-2 text-sm disabled:bg-gray-50 disabled:cursor-not-allowed'
      />
      {disabled && lockedHint ? (
        <span className='text-xs text-amber-700'>{lockedHint}</span>
      ) : hint ? (
        <span className='text-xs text-gray-600'>{hint}</span>
      ) : null}
    </label>
  );
}

function KycLevelSelect({ label, name, defaultValue, disabled, lockedHint }: {
  label: string;
  name: string;
  defaultValue: number | null | undefined;
  disabled?: boolean;
  lockedHint?: string;
}) {
  const display =
    defaultValue === null || defaultValue === undefined ? 'null' : String(defaultValue);
  return (
    <label className={`flex flex-col gap-1 ${disabled ? 'opacity-60' : ''}`}>
      <span className='text-xs font-medium text-gray-700'>{label}</span>
      <select
        key={display}
        name={name}
        defaultValue={display}
        disabled={disabled}
        className='border border-gray-200 rounded px-3 py-2 text-sm bg-white disabled:bg-gray-50 disabled:cursor-not-allowed'
      >
        <option value='null'>Disabled</option>
        <option value='0'>0 — unverified</option>
        <option value='1'>1 — basic</option>
        <option value='2'>2 — intermediate</option>
        <option value='3'>3 — full</option>
      </select>
      {disabled && lockedHint && (
        <span className='text-xs text-amber-700'>{lockedHint}</span>
      )}
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
      {hint && <span className='text-xs text-gray-600'>{hint}</span>}
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
      <p className='text-xs text-gray-700'>
        Per-provider revenue share (% of provider GGR). Providers not listed
        contribute 0% — i.e. no <code>game_provider_fees</code> deduction.
        {scope !== 'default' && (
          <span className='block mt-1'>
            Overrides the operator-default rate for this brand only.
          </span>
        )}
      </p>

      {isLoading && <p className='text-sm text-gray-600'>Loading...</p>}

      {!isLoading && (
        <div className='overflow-x-auto'>
          <table className='w-full'>
            <thead className='bg-gray-50'>
              <tr>
                <th className='px-4 py-2 text-left text-xs font-semibold text-gray-700'>Provider ID</th>
                <th className='px-4 py-2 text-left text-xs font-semibold text-gray-700'>Display Name</th>
                <th className='px-4 py-2 text-right text-xs font-semibold text-gray-700'>Fee %</th>
                <th className='px-4 py-2 text-right text-xs font-semibold text-gray-700'></th>
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
                      className='text-primary-dark hover:underline mr-3'
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
                  <td colSpan={4} className='px-4 py-6 text-center text-sm text-gray-600'>
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

const PROVIDER_RATES_CSV_HEADERS = ['providerId', 'providerName', 'feePercent'];

function ProviderRatesBulkImport({ scope }: { scope: Scope }) {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Validate the parsed CSV against the expected shape. Returns rows ready to
  // POST plus any human-readable errors so we can refuse the click before
  // hitting the network.
  const validateRows = (raw: Record<string, string>[]) => {
    const out: { providerId: string; providerName: string; feePercent: number }[] = [];
    const errors: string[] = [];
    raw.forEach((r, idx) => {
      const rowNum = idx + 2; // +1 for header, +1 for 1-based row numbers
      const providerId = (r.providerId ?? '').trim();
      const providerName = (r.providerName ?? '').trim();
      const feePercent = Number((r.feePercent ?? '').trim());
      if (!providerId) {
        errors.push(`Row ${rowNum}: providerId is empty`);
        return;
      }
      if (!Number.isFinite(feePercent) || feePercent < 0 || feePercent > 100) {
        errors.push(`Row ${rowNum}: feePercent must be 0–100`);
        return;
      }
      out.push({ providerId, providerName, feePercent });
    });
    return { rows: out, errors };
  };

  const parseCurrent = () => {
    if (!text.trim()) return { rows: [], errors: [] as string[] };
    const { headers, rows: parsedRows } = parseCsv(text);
    if (!headers.length) {
      return { rows: [], errors: ['Missing header row'] };
    }
    const missing = PROVIDER_RATES_CSV_HEADERS.filter((h) => !headers.includes(h));
    if (missing.length) {
      return { rows: [], errors: [`Missing required column(s): ${missing.join(', ')}`] };
    }
    return validateRows(parsedRows);
  };

  const onImport = async () => {
    const { rows, errors } = parseCurrent();
    if (errors.length) {
      setMsg({ type: 'err', text: errors.slice(0, 5).join('  •  ') });
      return;
    }
    if (rows.length === 0) {
      setMsg({ type: 'err', text: 'Nothing to import' });
      return;
    }
    setImporting(true);
    setMsg(null);
    try {
      const result = await baseService.add<{ imported: number; inserted: number; updated: number }>(
        FEES_API_URLS.PROVIDER_RATES_BULK(),
        { brandId: scope, rates: rows },
      );
      setMsg({
        type: 'ok',
        text: `Imported ${result.imported} (${result.inserted} new, ${result.updated} updated).`,
      });
      qc.invalidateQueries({ queryKey: ['fees-provider-rates', scope] });
      setText('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (e: any) {
      setMsg({ type: 'err', text: e?.response?.data?.error ?? e?.message ?? 'Failed to import' });
    } finally {
      setImporting(false);
    }
  };

  const onDownloadTemplate = () => {
    const csv = buildCsv(PROVIDER_RATES_CSV_HEADERS, [
      { providerId: 'coco-gamings',  providerName: 'Coco Gamings',    feePercent: 5 },
      { providerId: 'pragmatic-play', providerName: 'Pragmatic Play', feePercent: 3 },
      { providerId: 'evolution',     providerName: 'Evolution',       feePercent: 4.5 },
    ]);
    downloadCsv('provider-fees-template.csv', csv);
  };

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMsg(null);
    try {
      const content = await readFileAsText(file);
      setText(content);
    } catch (err: any) {
      setMsg({ type: 'err', text: err?.message ?? 'Failed to read file' });
    }
  };

  const { rows: previewRows, errors: previewErrors } = parseCurrent();

  return (
    <div className='space-y-3'>
      <p className='text-xs text-gray-700'>
        Import provider rates from a CSV with the columns{' '}
        <code className='bg-gray-100 px-1 rounded'>providerId, providerName, feePercent</code>{' '}
        (header row required). Existing providers are updated by ID; new
        providers are added. Lines starting with{' '}
        <code className='bg-gray-100 px-1 rounded'>#</code> are ignored.
      </p>

      <div className='flex flex-wrap items-center gap-2'>
        <button
          type='button'
          onClick={onDownloadTemplate}
          className='border border-gray-200 text-gray-700 px-3 py-1.5 rounded text-xs font-medium hover:bg-gray-50'
        >
          Download CSV template
        </button>
        <button
          type='button'
          onClick={() => fileInputRef.current?.click()}
          className='border border-gray-200 text-gray-700 px-3 py-1.5 rounded text-xs font-medium hover:bg-gray-50'
        >
          Upload CSV
        </button>
        <input
          ref={fileInputRef}
          type='file'
          accept='.csv,text/csv'
          onChange={onUpload}
          className='hidden'
        />
        <span className='text-xs text-gray-600'>…or paste below</span>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={10}
        placeholder={`providerId,providerName,feePercent
coco-gamings,Coco Gamings,5
pragmatic-play,Pragmatic Play,3
evolution,Evolution,4.5`}
        className='w-full font-mono text-xs border border-gray-200 rounded p-3 focus:outline-none focus:border-primary'
        spellCheck={false}
      />

      <div className='flex items-center gap-3 flex-wrap'>
        <button
          type='button'
          onClick={onImport}
          disabled={importing || !text.trim() || previewErrors.length > 0 || previewRows.length === 0}
          className='bg-primary text-white px-4 py-2 rounded text-sm font-semibold hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed'
        >
          {importing ? 'Importing…' : previewRows.length ? `Import ${previewRows.length}` : 'Import'}
        </button>
        {previewErrors.length > 0 && (
          <span className='text-xs text-red-600'>
            {previewErrors.length === 1
              ? previewErrors[0]
              : `${previewErrors.length} errors — ${previewErrors.slice(0, 2).join('; ')}${previewErrors.length > 2 ? '…' : ''}`}
          </span>
        )}
        {msg && (
          <span className={`text-xs ${msg.type === 'ok' ? 'text-green-700' : 'text-red-600'}`}>
            {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}

function ProviderFeesSection({ scope }: { scope: Scope }) {
  const { limits } = useOperatorPlan();
  // Bulk CSV import lives behind a plan flag; the BE rejects too. We just
  // grey the tab and stop selection so the operator sees what they'd
  // unlock without surprises.
  const bulkEnabled = limits ? limits.bulkImport : true;
  const [tab, setTab] = useState<'rates' | 'bulk'>('rates');
  return (
    <div className='space-y-4'>
      <div className='flex gap-1 bg-gray-100 p-0.5 rounded-md w-fit'>
        <button
          type='button'
          onClick={() => setTab('rates')}
          className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
            tab === 'rates' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          Rates
        </button>
        <button
          type='button'
          disabled={!bulkEnabled}
          onClick={() => setTab('bulk')}
          title={bulkEnabled ? '' : 'Upgrade to Affiliate Plus to enable bulk CSV import'}
          className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
            tab === 'bulk' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-600 hover:text-gray-800'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          Bulk import{!bulkEnabled && ' 🔒'}
        </button>
      </div>
      {tab === 'rates' ? <ProviderRatesTable scope={scope} /> : <ProviderRatesBulkImport scope={scope} />}
    </div>
  );
}

function RunFeesButton() {
  // Default the range to "yesterday only" — the most common manual case
  // (fee job choked or operator wants to spot-check). Date is YYYY-MM-DD
  // local-string for the native input; we send ISO when posting.
  const yesterdayISO = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }, []);

  const [dateFrom, setDateFrom] = useState(yesterdayISO);
  const [dateTo,   setDateTo]   = useState(yesterdayISO);
  const [applyCurrentFees, setApplyCurrentFees] = useState(false);
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const qc = useQueryClient();

  const dayCount = useMemo(() => {
    const f = new Date(dateFrom);
    const t = new Date(dateTo);
    if (Number.isNaN(f.getTime()) || Number.isNaN(t.getTime()) || f > t) return 0;
    return Math.floor((t.getTime() - f.getTime()) / 86400000) + 1;
  }, [dateFrom, dateTo]);

  const run = async () => {
    if (dayCount <= 0) {
      setMsg('Pick a valid date range.');
      return;
    }
    if (applyCurrentFees) {
      const ok = window.confirm(
        `Apply CURRENT fee rates to ${dayCount} day${dayCount === 1 ? '' : 's'} (${dateFrom} → ${dateTo})?\n\n` +
        `This will overwrite the historical fee snapshot for that period. ` +
        `Only do this if you forgot to update fees on time and want past reports to reflect today’s rates.`,
      );
      if (!ok) return;
    }
    setRunning(true);
    setMsg(null);
    try {
      await baseService.add(FEES_API_URLS.RUN(), {
        dateFrom, dateTo, applyCurrentFees,
      });
      setMsg(
        `Re-ran ${dayCount} day${dayCount === 1 ? '' : 's'}` +
        ` using ${applyCurrentFees ? 'current' : 'historical'} fees.`,
      );
      qc.invalidateQueries();
    } catch (e: any) {
      setMsg(e?.response?.data?.error ?? e?.message ?? 'Failed to run');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className='space-y-3'>
      <div className='flex flex-wrap items-end gap-3'>
        <div>
          <label className='block text-[10px] font-semibold uppercase tracking-wider text-gray-600 mb-1'>From</label>
          <input
            type='date'
            value={dateFrom}
            max={dateTo}
            onChange={(e) => setDateFrom(e.target.value)}
            className='h-9 text-sm rounded-lg border border-gray-200 px-2 focus:outline-none focus:border-primary bg-white'
          />
        </div>
        <div>
          <label className='block text-[10px] font-semibold uppercase tracking-wider text-gray-600 mb-1'>To</label>
          <input
            type='date'
            value={dateTo}
            min={dateFrom}
            onChange={(e) => setDateTo(e.target.value)}
            className='h-9 text-sm rounded-lg border border-gray-200 px-2 focus:outline-none focus:border-primary bg-white'
          />
        </div>
        <button
          onClick={run}
          disabled={running || dayCount <= 0}
          className='h-9 px-4 text-sm bg-primary text-white rounded-lg font-semibold hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed'
        >
          {running ? 'Running…' : `Re-run ${dayCount || 0} day${dayCount === 1 ? '' : 's'}`}
        </button>
      </div>

      <label className='flex items-start gap-2 cursor-pointer select-none'>
        <input
          type='checkbox'
          checked={applyCurrentFees}
          onChange={(e) => setApplyCurrentFees(e.target.checked)}
          className='mt-0.5 h-3.5 w-3.5 rounded border-gray-300 text-primary focus:ring-primary'
        />
        <span className='text-xs text-gray-700'>
          <b>Apply current fees retroactively.</b>{' '}
          <span className='text-gray-600'>
            Off (default): use the fee snapshot active on each past day — re-run is idempotent and historical reports stay frozen.
            On: overwrite past-day fee numbers with today’s active rates. Use only when you forgot to update fees on time.
          </span>
        </span>
      </label>

      {msg && (
        <p className={`text-xs ${msg.startsWith('Re-ran') ? 'text-green-700' : 'text-gray-700'}`}>{msg}</p>
      )}
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
    <div className='h-full overflow-auto p-6 pb-24 space-y-6'>
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

      {scope === 'default' && (
        <Card title='Commission defaults'>
          <CommissionDefaultsForm />
        </Card>
      )}
      <Card title='Operator-wide fees'>
        <SettingsForm scope={scope} />
      </Card>
      <Card title='Provider fees'>
        <ProviderFeesSection scope={scope} />
      </Card>
      <Card title='Manual fees recalculation'>
        <p className='text-xs text-gray-700 mb-3'>
          Replays the fees job for a date range you choose. By default each
          past day uses the fee rates that were active on that day — so
          re-running doesn’t change historical reports. Tick the box below
          to overwrite past-day fees with today’s rates (use only when you
          forgot to update before a rate change went live).
        </p>
        <RunFeesButton />
      </Card>
    </div>
  );
}
