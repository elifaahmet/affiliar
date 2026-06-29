import { useState } from 'react';
import { useBaseQuery } from 'api/core/useBaseQuery';
import { BONUS_OFFERS_API_URLS, BRANDS_API_URLS, AFFILIATES_API_URLS } from 'config/apiUrls';
import axiosInstance from 'config/axiosInstance';
import queryClient from 'config/queryClient';

interface Brand { _id: string; name: string }
interface AffiliateOpt { _id: string; username?: string; email?: string; name?: string }
interface Offer {
  _id: string;
  name: string;
  description: string | null;
  type: 'deposit_bonus' | 'free_spins' | 'cashback';
  currency: string;
  wageringMultiplier: number;
  validityDays: number;
  percentAmount: number | null;
  minDepositAmount: number | null;
  maxBonusAmount: number | null;
  freeSpinCount: number | null;
  cashbackPercent: number | null;
  baseCode: string;
  status: 'draft' | 'active' | 'archived';
  brandId: { _id: string; name: string } | null;
  source: 'manual' | 'casino';
  distributable: boolean;
  codes: number;
  claims: number;
}

const TYPE_LABEL: Record<string, string> = { deposit_bonus: 'Deposit match', free_spins: 'Free spins', cashback: 'Cashback' };

function terms(o: Offer): string {
  if (o.type === 'deposit_bonus') return `${o.percentAmount ?? 0}% up to ${o.maxBonusAmount ?? '—'} ${o.currency}, min dep ${o.minDepositAmount ?? 0}`;
  if (o.type === 'free_spins') return `${o.freeSpinCount ?? 0} free spins`;
  return `${o.cashbackPercent ?? 0}% cashback`;
}

export default function BonusOffersPage() {
  const { data: brandsData } = useBaseQuery<{ brands: Brand[] }>({ endpoint: BRANDS_API_URLS.LIST(), queryKey: ['bo-brands'] });
  const brands = brandsData?.brands ?? [];
  const { data, isLoading } = useBaseQuery<{ offers: Offer[]; provisioning: boolean; pullConfigured: boolean }>({
    endpoint: BONUS_OFFERS_API_URLS.LIST(), queryKey: ['bonus-offers'],
  });
  const offers = data?.offers ?? [];
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['bonus-offers'] });

  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const sync = async () => {
    setSyncing(true); setSyncMsg('');
    try {
      const { data: r } = await axiosInstance.post(BONUS_OFFERS_API_URLS.SYNC(), {});
      setSyncMsg(`Synced ${r.synced} bonus${r.synced === 1 ? '' : 'es'} from the casino.`);
      refresh();
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } } };
      setSyncMsg(err.response?.data?.error || 'Sync failed.');
    } finally { setSyncing(false); setTimeout(() => setSyncMsg(''), 6000); }
  };

  return (
    <div className='h-full overflow-auto p-6 pb-24 space-y-5'>
      <div>
        <h1 className='text-xl font-semibold text-gray-800'>Player bonuses</h1>
        <p className='text-xs text-gray-600 mt-1'>
          Define a player bonus, then authorize affiliates to distribute it to their own players. Each affiliate
          gets a unique code (created as a real bonus in the casino) plus a shareable link.
        </p>
      </div>

      {data && !data.pullConfigured && (
        <div className='text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2'>
          ⚠️ Casino bonus API not configured — set <code className='mx-1'>CASINO_BONUS_API_URL</code> +
          <code className='mx-1'>CASINO_BONUS_API_TOKEN</code> to pull this casino's bonus catalog.
        </div>
      )}

      <div className='flex items-center gap-3 flex-wrap'>
        {data?.pullConfigured && (
          <button onClick={sync} disabled={syncing}
            className='text-sm font-medium text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-lg px-4 py-2 disabled:opacity-50'>
            {syncing ? 'Syncing…' : '↻ Sync from casino'}
          </button>
        )}
        <CreateForm brands={brands} onCreated={refresh} />
        {syncMsg && <span className='text-xs text-gray-600'>{syncMsg}</span>}
      </div>

      {isLoading ? <p className='text-sm text-gray-600'>Loading…</p>
        : offers.length === 0 ? <p className='text-sm text-gray-600'>No bonuses yet. Create your first above.</p>
        : <div className='space-y-3'>{offers.map((o) => <OfferRow key={o._id} o={o} onChanged={refresh} />)}</div>}
    </div>
  );
}

function CreateForm({ brands, onCreated }: { brands: Brand[]; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    name: '', brandId: '', type: 'deposit_bonus', baseCode: '', wageringMultiplier: '15', validityDays: '30',
    percentAmount: '', minDepositAmount: '', maxBonusAmount: '', freeSpinCount: '', cashbackPercent: '', cashbackMaxAmount: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));
  const num = (v: string) => (v === '' ? undefined : Number(v));

  const submit = async () => {
    if (!f.name.trim() || !f.baseCode.trim() || saving) return;
    setSaving(true); setError('');
    try {
      await axiosInstance.post(BONUS_OFFERS_API_URLS.CREATE(), {
        name: f.name, brandId: f.brandId || undefined, type: f.type, baseCode: f.baseCode,
        wageringMultiplier: Number(f.wageringMultiplier) || 15, validityDays: Number(f.validityDays) || 30,
        percentAmount: num(f.percentAmount), minDepositAmount: num(f.minDepositAmount), maxBonusAmount: num(f.maxBonusAmount),
        freeSpinCount: num(f.freeSpinCount), cashbackPercent: num(f.cashbackPercent), cashbackMaxAmount: num(f.cashbackMaxAmount),
        status: 'active',
      });
      setF({ name: '', brandId: '', type: 'deposit_bonus', baseCode: '', wageringMultiplier: '15', validityDays: '30', percentAmount: '', minDepositAmount: '', maxBonusAmount: '', freeSpinCount: '', cashbackPercent: '', cashbackMaxAmount: '' });
      setOpen(false); onCreated();
    } catch (e) { const err = e as { response?: { data?: { error?: string } } }; setError(err.response?.data?.error || 'Failed'); }
    finally { setSaving(false); }
  };

  if (!open) return <button onClick={() => setOpen(true)} className='text-sm font-medium text-white bg-primary rounded-lg px-4 py-2'>+ New bonus</button>;
  const input = 'w-full text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary';
  return (
    <div className='bg-white rounded-xl border border-violet-100 p-5 space-y-3'>
      <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
        <input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder='Name (e.g. Welcome 100%)' className={input} />
        <input value={f.baseCode} onChange={(e) => set('baseCode', e.target.value.toUpperCase())} placeholder='Base code (e.g. WELCOME)' className={input} />
      </div>
      <div className='grid grid-cols-1 sm:grid-cols-3 gap-3'>
        <select value={f.type} onChange={(e) => set('type', e.target.value)} className={input}>
          <option value='deposit_bonus'>Deposit match</option>
          <option value='free_spins'>Free spins</option>
          <option value='cashback'>Cashback</option>
        </select>
        <select value={f.brandId} onChange={(e) => set('brandId', e.target.value)} className={input}>
          <option value=''>All brands</option>
          {brands.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
        </select>
        <input value={f.wageringMultiplier} onChange={(e) => set('wageringMultiplier', e.target.value)} type='number' placeholder='Wagering ×(≥15)' className={input} />
      </div>

      {f.type === 'deposit_bonus' && (
        <div className='grid grid-cols-1 sm:grid-cols-3 gap-3'>
          <input value={f.percentAmount} onChange={(e) => set('percentAmount', e.target.value)} type='number' placeholder='Match %' className={input} />
          <input value={f.minDepositAmount} onChange={(e) => set('minDepositAmount', e.target.value)} type='number' placeholder='Min deposit' className={input} />
          <input value={f.maxBonusAmount} onChange={(e) => set('maxBonusAmount', e.target.value)} type='number' placeholder='Max bonus' className={input} />
        </div>
      )}
      {f.type === 'free_spins' && (
        <input value={f.freeSpinCount} onChange={(e) => set('freeSpinCount', e.target.value)} type='number' placeholder='Number of free spins' className={input} />
      )}
      {f.type === 'cashback' && (
        <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
          <input value={f.cashbackPercent} onChange={(e) => set('cashbackPercent', e.target.value)} type='number' placeholder='Cashback %' className={input} />
          <input value={f.cashbackMaxAmount} onChange={(e) => set('cashbackMaxAmount', e.target.value)} type='number' placeholder='Max cashback' className={input} />
        </div>
      )}
      <input value={f.validityDays} onChange={(e) => set('validityDays', e.target.value)} type='number' placeholder='Validity (days)' className={input} />

      {error && <p className='text-xs text-red-500'>{error}</p>}
      <div className='flex justify-end gap-2'>
        <button onClick={() => setOpen(false)} className='h-9 px-4 rounded-lg text-sm text-gray-600 hover:bg-gray-100'>Cancel</button>
        <button onClick={submit} disabled={saving} className='h-9 px-5 rounded-lg text-sm font-medium text-white bg-primary disabled:opacity-40'>{saving ? 'Saving…' : 'Create'}</button>
      </div>
    </div>
  );
}

interface CodeRow { _id: string; affiliateName: string; code: string; provision: { status: string; error: string | null }; claimsCount: number }

function OfferRow({ o, onChanged }: { o: Offer; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [codes, setCodes] = useState<CodeRow[] | null>(null);
  const [authoring, setAuthoring] = useState(false);

  const loadCodes = async () => {
    const { data } = await axiosInstance.get(BONUS_OFFERS_API_URLS.CODES(o._id));
    setCodes(data.codes);
  };
  const toggle = async () => { const n = !open; setOpen(n); if (n && !codes) await loadCodes(); };
  const archive = async () => { setBusy(true); try { await axiosInstance.patch(BONUS_OFFERS_API_URLS.ITEM(o._id), { status: o.status === 'archived' ? 'active' : 'archived' }); onChanged(); } finally { setBusy(false); } };
  const del = async () => { if (!window.confirm(`Delete "${o.name}"?`)) return; setBusy(true); try { await axiosInstance.delete(BONUS_OFFERS_API_URLS.ITEM(o._id)); onChanged(); } catch (e) { const err = e as { response?: { data?: { error?: string } } }; window.alert(err.response?.data?.error || 'Failed'); } finally { setBusy(false); } };
  const reprovision = async (codeId: string) => { await axiosInstance.post(BONUS_OFFERS_API_URLS.REPROVISION(codeId)); await loadCodes(); };
  const setDistrib = async () => { setBusy(true); try { await axiosInstance.patch(BONUS_OFFERS_API_URLS.ITEM(o._id), { distributable: !o.distributable }); onChanged(); } finally { setBusy(false); } };

  return (
    <div className='bg-white rounded-xl border border-violet-100 overflow-hidden'>
      <div className='px-5 py-3 flex items-center gap-3 flex-wrap'>
        <div className='flex-1 min-w-[200px]'>
          <div className='flex items-center gap-2'>
            <p className='text-sm font-semibold text-gray-800'>{o.name}</p>
            <span className={`text-[10px] px-1.5 py-0.5 rounded capitalize ${o.status === 'active' ? 'bg-green-50 text-green-600' : o.status === 'archived' ? 'bg-gray-100 text-gray-400' : 'bg-blue-50 text-blue-600'}`}>{o.status}</span>
          </div>
          <p className='text-xs text-gray-500 mt-0.5'>
            {TYPE_LABEL[o.type]} · {terms(o)} · {o.wageringMultiplier}× wagering · {o.baseCode}{o.brandId ? ` · ${o.brandId.name}` : ' · All brands'}
          </p>
        </div>
        <div className='text-xs text-gray-600'>{o.codes} affiliates · {o.claims} claims</div>
        <div className='flex items-center gap-2'>
          <button onClick={setDistrib} disabled={busy} className={`text-xs hover:underline ${o.distributable ? 'text-green-600 font-medium' : 'text-gray-500'}`}>
            {o.distributable ? '✓ Distributable' : 'Make distributable'}
          </button>
          <button onClick={() => setAuthoring(true)} className='text-xs font-medium text-violet-700 hover:underline'>Authorize</button>
          <button onClick={toggle} className='text-xs text-gray-600 hover:underline'>{open ? 'Hide' : 'Codes'}</button>
          <button onClick={archive} disabled={busy} className='text-xs text-gray-600 hover:underline'>{o.status === 'archived' ? 'Activate' : 'Archive'}</button>
          <button onClick={del} disabled={busy} className='text-xs text-red-500 hover:underline'>Delete</button>
        </div>
      </div>

      {authoring && <AuthorizeModal offerId={o._id} onClose={() => setAuthoring(false)} onDone={() => { setAuthoring(false); onChanged(); if (open) loadCodes(); }} />}

      {open && (
        <div className='border-t border-gray-100 p-4 bg-gray-50/50'>
          {!codes ? <p className='text-xs text-gray-500'>Loading…</p>
            : codes.length === 0 ? <p className='text-xs text-gray-500'>No affiliates authorized yet.</p>
            : <div className='bg-white rounded-lg border border-gray-100 divide-y divide-gray-50'>
                {codes.map((c) => (
                  <div key={c._id} className='flex items-center gap-2 px-3 py-1.5'>
                    <span className='flex-1 text-xs text-gray-800 truncate'>{c.affiliateName}</span>
                    <code className='text-xs text-violet-700'>{c.code}</code>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${c.provision.status === 'created' ? 'bg-green-50 text-green-600' : c.provision.status === 'failed' ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-500'}`} title={c.provision.error || ''}>{c.provision.status}</span>
                    {c.provision.status !== 'created' && <button onClick={() => reprovision(c._id)} className='text-[10px] text-violet-700 hover:underline'>Re-sync</button>}
                  </div>
                ))}
              </div>}
        </div>
      )}
    </div>
  );
}

function AuthorizeModal({ offerId, onClose, onDone }: { offerId: string; onClose: () => void; onDone: () => void }) {
  const [all, setAll] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const { data } = useBaseQuery<{ affiliates: AffiliateOpt[] }>({ endpoint: AFFILIATES_API_URLS.LIST(), queryKey: ['bo-affiliates'] });
  const affiliates = data?.affiliates ?? [];
  const label = (a: AffiliateOpt) => a.name || a.username || a.email || a._id;
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const submit = async () => {
    setSaving(true);
    try {
      await axiosInstance.post(BONUS_OFFERS_API_URLS.AUTHORIZE(offerId), all ? { allAffiliates: true } : { affiliateIds: Array.from(picked) });
      onDone();
    } finally { setSaving(false); }
  };

  return (
    <div className='fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4' onClick={onClose}>
      <div className='bg-white rounded-2xl shadow-2xl w-full max-w-md' onClick={(e) => e.stopPropagation()}>
        <div className='px-5 py-3 border-b border-gray-100 flex items-center justify-between'>
          <h2 className='text-base font-semibold text-gray-800'>Authorize affiliates</h2>
          <button onClick={onClose} className='text-gray-400 hover:text-gray-600 text-lg'>×</button>
        </div>
        <div className='p-5 space-y-3'>
          <label className='flex items-center gap-2 text-sm text-gray-700'>
            <input type='checkbox' checked={all} onChange={(e) => setAll(e.target.checked)} /> All affiliates ({affiliates.length})
          </label>
          {!all && (
            <div className='max-h-52 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-50'>
              {affiliates.map((a) => (
                <label key={a._id} className='flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer'>
                  <input type='checkbox' checked={picked.has(a._id)} onChange={() => toggle(a._id)} /><span className='truncate'>{label(a)}</span>
                </label>
              ))}
            </div>
          )}
          <div className='flex justify-end gap-2'>
            <button onClick={onClose} className='h-9 px-4 rounded-lg text-sm text-gray-600 hover:bg-gray-100'>Cancel</button>
            <button onClick={submit} disabled={saving || (!all && picked.size === 0)} className='h-9 px-5 rounded-lg text-sm font-medium text-white bg-primary disabled:opacity-40'>
              {saving ? 'Authorizing…' : 'Authorize & create codes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
