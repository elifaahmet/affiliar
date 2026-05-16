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
  sbThirdPartyFeePercent: number;
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
        depositFeePercent:      Number(form.get('deposit') ?? 0),
        withdrawalFeePercent:   Number(form.get('withdrawal') ?? 0),
        jackpotFeePercent:      Number(form.get('jackpot') ?? 0),
        casinoTaxPercent:       Number(form.get('tax') ?? 0),
        sbThirdPartyFeePercent: Number(form.get('sbThirdParty') ?? 0),
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
      <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4'>
        <NumberInput label='Deposit Fee %'    name='deposit'      defaultValue={s?.depositFeePercent ?? 0}      hint='% of deposits (processor cost)' />
        <NumberInput label='Withdrawal Fee %' name='withdrawal'   defaultValue={s?.withdrawalFeePercent ?? 0}   hint='% of cashouts (processor cost)' />
        <NumberInput label='Jackpot %'        name='jackpot'      defaultValue={s?.jackpotFeePercent ?? 0}      hint='% of casino bets' />
        <NumberInput label='Casino Tax %'     name='tax'          defaultValue={s?.casinoTaxPercent ?? 0}       hint='% of casino GGR' />
        <NumberInput label='SB 3rd-party %'   name='sbThirdParty' defaultValue={s?.sbThirdPartyFeePercent ?? 0} hint='% of sportsbook GGR (bookmaker/data-feed)' />
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

function CommissionDefaultsForm() {
  const qc = useQueryClient();
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
      {hint && <span className='text-xs text-gray-600'>{hint}</span>}
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

function ProviderRatesBulkImport({ scope }: { scope: Scope }) {
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Format per line: providerId<sep>[providerName<sep>]feePercent.
  // <sep> is comma or tab so an Excel/Sheets paste works as-is. Empty lines
  // and lines starting with '#' are ignored. Returns rows + a list of
  // human-readable errors so we can bail before the network call.
  const parseRows = () => {
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
    const rows: { providerId: string; providerName: string; feePercent: number }[] = [];
    const errors: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const parts = lines[i].split(/[\t,]/).map((p) => p.trim());
      if (parts.length < 2) {
        errors.push(`Row ${i + 1}: needs at least providerId and feePercent`);
        continue;
      }
      const providerId = parts[0];
      let providerName = '';
      let feePercentRaw: string;
      if (parts.length === 2) {
        feePercentRaw = parts[1];
      } else {
        providerName = parts[1];
        feePercentRaw = parts[2];
      }
      const feePercent = Number(feePercentRaw);
      if (!providerId) {
        errors.push(`Row ${i + 1}: providerId is empty`);
        continue;
      }
      if (!Number.isFinite(feePercent) || feePercent < 0 || feePercent > 100) {
        errors.push(`Row ${i + 1}: feePercent must be 0–100`);
        continue;
      }
      rows.push({ providerId, providerName, feePercent });
    }
    return { rows, errors };
  };

  const onImport = async () => {
    const { rows, errors } = parseRows();
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
    } catch (e: any) {
      setMsg({ type: 'err', text: e?.response?.data?.error ?? e?.message ?? 'Failed to import' });
    } finally {
      setImporting(false);
    }
  };

  const { rows: previewRows, errors: previewErrors } = parseRows();

  return (
    <div className='space-y-3'>
      <p className='text-xs text-gray-700'>
        Paste one provider per line. Format:{' '}
        <code className='bg-gray-100 px-1 rounded'>providerId,providerName,feePercent</code>{' '}
        — commas or tabs (so an Excel/Sheets paste works). Lines starting with{' '}
        <code className='bg-gray-100 px-1 rounded'>#</code> are ignored. Existing
        providers are updated by ID; new providers are added.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={10}
        placeholder={`# providerId, displayName, feePercent
coco-gamings, Coco Gamings, 5
pragmatic, Pragmatic Play, 3
evolution, Evolution, 4.5`}
        className='w-full font-mono text-xs border border-gray-200 rounded p-3 focus:outline-none focus:border-primary'
        spellCheck={false}
      />
      <div className='flex items-center gap-3 flex-wrap'>
        <button
          type='button'
          onClick={onImport}
          disabled={importing || !text.trim() || previewErrors.length > 0}
          className='bg-primary text-white px-4 py-2 rounded text-sm font-semibold hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed'
        >
          {importing ? 'Importing…' : `Import ${previewRows.length || ''}`.trim()}
        </button>
        {previewErrors.length > 0 && (
          <span className='text-xs text-red-600'>
            {previewErrors.length} parse error{previewErrors.length === 1 ? '' : 's'} —{' '}
            {previewErrors.slice(0, 2).join('; ')}
            {previewErrors.length > 2 && '…'}
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
          onClick={() => setTab('bulk')}
          className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
            tab === 'bulk' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          Bulk import
        </button>
      </div>
      {tab === 'rates' ? <ProviderRatesTable scope={scope} /> : <ProviderRatesBulkImport scope={scope} />}
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
      <Card title='Manual run'>
        <p className='text-xs text-gray-700 mb-3'>
          Re-runs the fees job for yesterday (idempotent — SummingMergeTree
          merges duplicates by source_event_id).
        </p>
        <RunFeesButton />
      </Card>
    </div>
  );
}
