import { useState } from 'react';
import { useBaseQuery } from 'api/core/useBaseQuery';
import { BONUS_CAMPAIGNS_API_URLS, BRANDS_API_URLS, AFFILIATES_API_URLS } from 'config/apiUrls';
import axiosInstance from 'config/axiosInstance';
import queryClient from 'config/queryClient';

interface Metric { key: string; label: string; money: boolean }
interface Brand { _id: string; name: string }
interface Campaign {
  _id: string;
  kind: 'target' | 'direct';
  name: string;
  description: string | null;
  metric: string;
  metricLabel: string | null;
  metricIsMoney: boolean;
  target: number | null;
  rewardCents: number;
  currency: string;
  startDate: string | null;
  endDate: string | null;
  phase: 'upcoming' | 'active' | 'ended' | 'archived' | 'granted';
  brandId: { _id: string; name: string } | null;
  awards: number;
  paid: number;
}

interface AffiliateOpt { _id: string; username?: string; email?: string; name?: string }

const eur = (c: number) => `€${(Number(c || 0) / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
const fmtVal = (v: number, money: boolean) => (money ? eur(v) : String(v));
const day = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });

const PHASE_STYLE: Record<string, string> = {
  active: 'bg-green-50 text-green-600',
  upcoming: 'bg-blue-50 text-blue-600',
  ended: 'bg-gray-100 text-gray-500',
  archived: 'bg-gray-100 text-gray-400',
  granted: 'bg-fuchsia-50 text-fuchsia-600',
};

export default function BonusCampaignsPage() {
  const { data: metricsData } = useBaseQuery<{ metrics: Metric[] }>({
    endpoint: BONUS_CAMPAIGNS_API_URLS.METRICS(), queryKey: ['bonus-metrics'],
  });
  const metrics = metricsData?.metrics ?? [];

  const { data: brandsData } = useBaseQuery<{ brands: Brand[] }>({
    endpoint: BRANDS_API_URLS.LIST(), queryKey: ['bonus-brands'],
  });
  const brands = brandsData?.brands ?? [];

  const { data, isLoading } = useBaseQuery<{ campaigns: Campaign[] }>({
    endpoint: BONUS_CAMPAIGNS_API_URLS.LIST(), queryKey: ['bonus-campaigns'],
  });
  const campaigns = data?.campaigns ?? [];

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['bonus-campaigns'] });

  return (
    <div className='h-full overflow-auto p-6 pb-24 space-y-5'>
      <div>
        <h1 className='text-xl font-semibold text-gray-800'>Bonus campaigns</h1>
        <p className='text-xs text-gray-600 mt-1'>
          Set time-boxed targets (e.g. 30 FTDs this month → €500). Affiliates see live progress; when they
          cross the target the bonus is awarded automatically and they're notified.
        </p>
      </div>

      <CreateForm metrics={metrics} brands={brands} onCreated={refresh} />

      {isLoading ? (
        <p className='text-sm text-gray-600'>Loading…</p>
      ) : campaigns.length === 0 ? (
        <p className='text-sm text-gray-600'>No campaigns yet. Create your first above.</p>
      ) : (
        <div className='space-y-3'>
          {campaigns.map((c) => <CampaignRow key={c._id} c={c} onChanged={refresh} />)}
        </div>
      )}
    </div>
  );
}

function CreateForm({ metrics, brands, onCreated }: { metrics: Metric[]; brands: Brand[]; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<'target' | 'direct'>('target');
  const [name, setName] = useState('');
  const [metric, setMetric] = useState('ftd');
  const [target, setTarget] = useState('');
  const [reward, setReward] = useState('');
  const [brandId, setBrandId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [allAffiliates, setAllAffiliates] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const { data: affData } = useBaseQuery<{ affiliates: AffiliateOpt[] }>({
    endpoint: AFFILIATES_API_URLS.LIST(), queryKey: ['bonus-affiliates'],
  });
  const affiliates = affData?.affiliates ?? [];
  const label = (a: AffiliateOpt) => a.name || a.username || a.email || a._id;

  const money = metrics.find((m) => m.key === metric)?.money ?? false;
  const reset = () => {
    setKind('target'); setName(''); setMetric('ftd'); setTarget(''); setReward('');
    setBrandId(''); setStartDate(''); setEndDate(''); setAllAffiliates(false); setPicked(new Set());
  };
  const togglePick = (id: string) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const submit = async () => {
    if (!name.trim() || !reward || saving) return;
    setSaving(true); setError('');
    try {
      const payload: Record<string, unknown> = { kind, name, rewardCents: Math.round(Number(reward) * 100), brandId: brandId || undefined };
      if (kind === 'target') {
        Object.assign(payload, {
          metric,
          target: money ? Math.round(Number(target) * 100) : Math.round(Number(target)),
          startDate, endDate,
        });
      } else {
        if (allAffiliates) payload.allAffiliates = true;
        else payload.affiliateIds = Array.from(picked);
      }
      await axiosInstance.post(BONUS_CAMPAIGNS_API_URLS.CREATE(), payload);
      reset(); setOpen(false); onCreated();
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } } };
      setError(err.response?.data?.error || 'Failed to create.');
    } finally { setSaving(false); }
  };

  if (!open) {
    return <button onClick={() => setOpen(true)} className='text-sm font-medium text-white bg-primary rounded-lg px-4 py-2'>+ New bonus</button>;
  }
  const input = 'w-full text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary';
  return (
    <div className='bg-white rounded-xl border border-violet-100 p-5 space-y-3'>
      <div className='flex rounded-lg border border-gray-200 overflow-hidden text-sm w-full sm:w-80'>
        {([['target', 'Target (race)'], ['direct', 'Direct grant']] as const).map(([k, lbl]) => (
          <button key={k} onClick={() => setKind(k)}
            className={`flex-1 py-2 font-medium ${kind === k ? 'bg-primary text-white' : 'bg-white text-gray-600'}`}>{lbl}</button>
        ))}
      </div>

      <input value={name} onChange={(e) => setName(e.target.value)}
        placeholder={kind === 'target' ? 'Name (e.g. April FTD Sprint)' : 'Name (e.g. Welcome bonus)'} className={input} />

      {kind === 'target' ? (
        <>
          <div className='grid grid-cols-1 sm:grid-cols-3 gap-3'>
            <select value={metric} onChange={(e) => setMetric(e.target.value)} className={input}>
              {metrics.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
            <input value={target} onChange={(e) => setTarget(e.target.value)} type='number' placeholder={money ? 'Target (€)' : 'Target (count)'} className={input} />
            <input value={reward} onChange={(e) => setReward(e.target.value)} type='number' placeholder='Reward (€)' className={input} />
          </div>
          <div className='grid grid-cols-1 sm:grid-cols-3 gap-3'>
            <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className={input}>
              <option value=''>All brands</option>
              {brands.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
            </select>
            <input value={startDate} onChange={(e) => setStartDate(e.target.value)} type='date' className={input} />
            <input value={endDate} onChange={(e) => setEndDate(e.target.value)} type='date' className={input} />
          </div>
        </>
      ) : (
        <>
          <input value={reward} onChange={(e) => setReward(e.target.value)} type='number' placeholder='Reward per affiliate (€)' className={input} />
          <label className='flex items-center gap-2 text-sm text-gray-700'>
            <input type='checkbox' checked={allAffiliates} onChange={(e) => setAllAffiliates(e.target.checked)} />
            Send to <strong>all</strong> my affiliates ({affiliates.length})
          </label>
          {!allAffiliates && (
            <div className='max-h-44 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-50'>
              {affiliates.length === 0 ? <p className='text-xs text-gray-500 p-3'>No affiliates.</p> : affiliates.map((a) => (
                <label key={a._id} className='flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer'>
                  <input type='checkbox' checked={picked.has(a._id)} onChange={() => togglePick(a._id)} />
                  <span className='truncate'>{label(a)}</span>
                </label>
              ))}
            </div>
          )}
          {!allAffiliates && <p className='text-xs text-gray-500'>{picked.size} selected</p>}
        </>
      )}

      {error && <p className='text-xs text-red-500'>{error}</p>}
      <div className='flex justify-end gap-2'>
        <button onClick={() => { reset(); setOpen(false); }} className='h-9 px-4 rounded-lg text-sm text-gray-600 hover:bg-gray-100'>Cancel</button>
        <button onClick={submit} disabled={saving} className='h-9 px-5 rounded-lg text-sm font-medium text-white bg-primary disabled:opacity-40'>
          {saving ? 'Saving…' : kind === 'target' ? 'Launch' : 'Grant bonus'}
        </button>
      </div>
    </div>
  );
}

interface LeaderRow { affiliateId: string; name: string; value: number; achieved: boolean; awarded: boolean }
interface Award { _id: string; name: string; rewardCents: number; status: 'pending' | 'paid'; achievedAt: string }

function CampaignRow({ c, onChanged }: { c: Campaign; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState<{ leaderboard: LeaderRow[]; awards: Award[] } | null>(null);

  const loadProgress = async () => {
    const { data } = await axiosInstance.get(BONUS_CAMPAIGNS_API_URLS.PROGRESS(c._id));
    setProg({ leaderboard: data.leaderboard, awards: data.awards });
  };
  const toggle = async () => {
    const next = !open; setOpen(next);
    if (next && !prog) await loadProgress();
  };
  const evaluate = async () => {
    setBusy(true);
    try { await axiosInstance.post(BONUS_CAMPAIGNS_API_URLS.EVALUATE(c._id)); await loadProgress(); onChanged(); }
    finally { setBusy(false); }
  };
  const archive = async () => {
    setBusy(true);
    try { await axiosInstance.patch(BONUS_CAMPAIGNS_API_URLS.ITEM(c._id), { status: c.phase === 'archived' ? 'active' : 'archived' }); onChanged(); }
    finally { setBusy(false); }
  };
  const del = async () => {
    if (!window.confirm(`Delete “${c.name}”?`)) return;
    setBusy(true);
    try { await axiosInstance.delete(BONUS_CAMPAIGNS_API_URLS.ITEM(c._id)); onChanged(); }
    catch (e) { const err = e as { response?: { data?: { error?: string } } }; window.alert(err.response?.data?.error || 'Failed'); }
    finally { setBusy(false); }
  };
  const markPaid = async (awardId: string) => {
    await axiosInstance.post(BONUS_CAMPAIGNS_API_URLS.MARK_AWARD_PAID(awardId));
    await loadProgress(); onChanged();
  };

  return (
    <div className='bg-white rounded-xl border border-violet-100 overflow-hidden'>
      <div className='px-5 py-3 flex items-center gap-3 flex-wrap'>
        <div className='flex-1 min-w-[180px]'>
          <div className='flex items-center gap-2'>
            <p className='text-sm font-semibold text-gray-800'>{c.name}</p>
            <span className={`text-[10px] px-1.5 py-0.5 rounded capitalize ${PHASE_STYLE[c.phase]}`}>{c.phase}</span>
          </div>
          <p className='text-xs text-gray-500 mt-0.5'>
            {c.kind === 'direct'
              ? <>Direct grant → <strong className='text-gray-700'>{eur(c.rewardCents)}</strong> each</>
              : <>{fmtVal(c.target ?? 0, c.metricIsMoney)} {c.metricLabel} → <strong className='text-gray-700'>{eur(c.rewardCents)}</strong>{' · '}{c.startDate && c.endDate ? `${day(c.startDate)}–${day(c.endDate)}` : ''}</>}
            {c.brandId ? ` · ${c.brandId.name}` : ' · All brands'}
          </p>
        </div>
        <div className='text-xs text-gray-600'>{c.awards} awarded · {c.paid} paid</div>
        <div className='flex items-center gap-2'>
          <button onClick={toggle} className='text-xs text-violet-700 hover:underline'>{open ? 'Hide' : c.kind === 'direct' ? 'Recipients' : 'Progress'}</button>
          {c.kind === 'target' && <button onClick={evaluate} disabled={busy} className='text-xs text-gray-600 hover:underline'>Evaluate</button>}
          <button onClick={archive} disabled={busy} className='text-xs text-gray-600 hover:underline'>{c.phase === 'archived' ? 'Activate' : 'Archive'}</button>
          <button onClick={del} disabled={busy} className='text-xs text-red-500 hover:underline'>Delete</button>
        </div>
      </div>

      {open && (
        <div className='border-t border-gray-100 p-4 space-y-4 bg-gray-50/50'>
          {!prog ? <p className='text-xs text-gray-500'>Loading…</p> : (
            <>
              {c.kind === 'target' && (
              <div>
                <p className='text-xs font-semibold text-gray-700 mb-1.5'>Leaderboard</p>
                {prog.leaderboard.length === 0 ? <p className='text-xs text-gray-500'>No activity yet.</p> : (
                  <div className='bg-white rounded-lg border border-gray-100 divide-y divide-gray-50'>
                    {prog.leaderboard.slice(0, 10).map((r, i) => (
                      <div key={r.affiliateId} className='flex items-center gap-2 px-3 py-1.5'>
                        <span className='w-5 text-[11px] text-gray-400'>{i + 1}</span>
                        <span className='flex-1 text-xs text-gray-800 truncate'>{r.name}</span>
                        <span className='text-xs text-gray-700'>{fmtVal(r.value, c.metricIsMoney)} / {fmtVal(c.target ?? 0, c.metricIsMoney)}</span>
                        {r.awarded ? <span className='text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-600'>awarded</span>
                          : r.achieved ? <span className='text-[10px] px-1.5 py-0.5 rounded bg-yellow-50 text-yellow-700'>reached</span>
                          : <span className='text-[10px] text-gray-300'>—</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              )}
              {prog.awards.length > 0 && (
                <div>
                  <p className='text-xs font-semibold text-gray-700 mb-1.5'>{c.kind === 'direct' ? 'Recipients' : 'Awards'}</p>
                  <div className='bg-white rounded-lg border border-gray-100 divide-y divide-gray-50'>
                    {prog.awards.map((a) => (
                      <div key={a._id} className='flex items-center gap-2 px-3 py-1.5'>
                        <span className='flex-1 text-xs text-gray-800 truncate'>{a.name}</span>
                        <span className='text-xs font-medium text-gray-900'>{eur(a.rewardCents)}</span>
                        {a.status === 'paid'
                          ? <span className='text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-600'>paid</span>
                          : <button onClick={() => markPaid(a._id)} className='text-[10px] px-2 py-0.5 rounded bg-primary text-white'>Mark paid</button>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
