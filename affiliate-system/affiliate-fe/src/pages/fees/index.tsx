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
  paymentSystemFeePercent: number;
  jackpotFeePercent: number;
  casinoTaxPercent: number;
}

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

function SettingsForm() {
  const qc = useQueryClient();
  const { data, isLoading } = useBaseQuery<{ settings: Settings }>({
    endpoint: FEES_API_URLS.SETTINGS(),
    queryKey: ['fees-settings'],
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
      await baseService.update(FEES_API_URLS.SETTINGS(), {
        paymentSystemFeePercent: Number(form.get('payment') ?? 0),
        jackpotFeePercent: Number(form.get('jackpot') ?? 0),
        casinoTaxPercent: Number(form.get('tax') ?? 0),
      });
      qc.invalidateQueries({ queryKey: ['fees-settings'] });
    } catch (e2: any) {
      setErr(e2?.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <p className='text-sm text-gray-400'>Loading...</p>;

  return (
    <form onSubmit={onSubmit} className='space-y-4'>
      <p className='text-xs text-gray-500'>
        Flat percentages applied by the daily fees job. Leave at 0 if you're
        publishing pre-aggregated fees yourself.
      </p>
      <div className='grid grid-cols-1 sm:grid-cols-3 gap-4'>
        <NumberInput label='Payment System %' name='payment' defaultValue={s?.paymentSystemFeePercent ?? 0} hint='% of deposits' />
        <NumberInput label='Jackpot %'         name='jackpot' defaultValue={s?.jackpotFeePercent ?? 0}        hint='% of bets' />
        <NumberInput label='Casino Tax %'      name='tax'     defaultValue={s?.casinoTaxPercent ?? 0}         hint='% of GGR' />
      </div>
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

function ProviderRatesTable() {
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useBaseQuery<{ rates: ProviderRate[] }>({
    endpoint: FEES_API_URLS.PROVIDER_RATES(),
    queryKey: ['fees-provider-rates'],
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
        providerId: editing.providerId.trim(),
        providerName: editing.providerName?.trim() ?? '',
        feePercent: Number(editing.feePercent ?? 0),
      });
      setEditing({});
      refetch();
      qc.invalidateQueries({ queryKey: ['fees-provider-rates'] });
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (providerId: string) => {
    if (!confirm(`Delete rate for ${providerId}?`)) return;
    await baseService.delete(FEES_API_URLS.PROVIDER_RATE(providerId), 0);
    refetch();
  };

  return (
    <div className='space-y-4'>
      <p className='text-xs text-gray-500'>
        Per-provider revenue share (% of provider GGR). Providers not listed
        contribute 0% — i.e. no game_provider_fees deduction.
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
                    No provider rates configured.
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

  const run = async () => {
    setRunning(true);
    setMsg(null);
    try {
      await baseService.add(FEES_API_URLS.RUN(), {});
      setMsg('Job triggered — yesterday was re-computed.');
      qc.invalidateQueries();
    } catch (e: any) {
      setMsg(e?.message ?? 'Failed to run');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className='flex items-center gap-3'>
      <button
        onClick={run}
        disabled={running}
        className='bg-primary text-white px-4 py-2 rounded text-sm font-semibold hover:bg-primary-dark disabled:opacity-50'
      >
        {running ? 'Running...' : 'Run daily fees job now'}
      </button>
      {msg && <p className='text-xs text-gray-600'>{msg}</p>}
    </div>
  );
}

export default function FeesPage() {
  return (
    <div className='bg-gray-100 h-full overflow-auto p-6 pb-24 space-y-6'>
      <div className='bg-amber-50 border-2 border-amber-400 rounded-xl p-4 flex gap-3 items-start'>
        <span className='text-amber-600 text-xl leading-none'>⚠️</span>
        <div>
          <p className='text-sm font-bold text-amber-900 mb-1'>
            Per category, pick one source of fees — don't do both.
          </p>
          <p className='text-sm text-amber-900'>
            Each fee category (payment system, jackpot, casino tax, game
            provider) is independent. For each one, either{' '}
            <b>configure the percentage here and let Affiliar compute it</b>,{' '}
            or <b>publish the value yourself</b> in{' '}
            <code className='bg-amber-100 px-1 rounded'>fees.daily.adjustment</code>{' '}
            events.
          </p>
          <p className='text-sm text-amber-900 mt-1'>
            Doing both for the <b>same category</b> will double-count that
            deduction. Mixing categories is fine — e.g. compute payment fees
            here while publishing game-provider fees from your own system.
          </p>
        </div>
      </div>

      <Card title='Operator-wide fees'>
        <SettingsForm />
      </Card>
      <Card title='Provider fees'>
        <ProviderRatesTable />
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
