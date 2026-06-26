import { useMemo, useState } from 'react';
import { useBaseQuery } from 'api/core/useBaseQuery';
import { CREATIVES_API_URLS, BRANDS_API_URLS } from 'config/apiUrls';
import axiosInstance from 'config/axiosInstance';
import queryClient from 'config/queryClient';

interface Brand { _id: string; name: string; url?: string }
interface Creative {
  _id: string;
  name: string;
  type: 'banner' | 'text';
  imageUrl: string | null;
  width: number | null;
  height: number | null;
  landingPath: string | null;
  body: string | null;
  status: 'active' | 'archived';
  brandId: { _id: string; name: string } | string | null;
}

const brandName = (c: Creative) => (typeof c.brandId === 'object' && c.brandId ? c.brandId.name : '—');

export default function CreativesPage() {
  const { data: brandsData } = useBaseQuery<{ brands: Brand[] }>({
    endpoint: BRANDS_API_URLS.LIST(),
    queryKey: ['creatives-brands'],
  });
  const brands = brandsData?.brands ?? [];

  const { data, isLoading } = useBaseQuery<{ creatives: Creative[] }>({
    endpoint: CREATIVES_API_URLS.LIST(),
    queryKey: ['creatives-list'],
  });
  const creatives = data?.creatives ?? [];

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['creatives-list'] });

  return (
    <div className='h-full overflow-auto p-6 pb-24 space-y-5'>
      <div>
        <h1 className='text-xl font-semibold text-gray-800'>Creatives</h1>
        <p className='text-xs text-gray-600 mt-1'>
          Publish banners and text snippets for your affiliates. They grab them from their Marketing page
          with their own tracking link baked in — performance shows up under a <code>creative-…</code> campaign.
        </p>
      </div>

      <CreateForm brands={brands} onCreated={refresh} />

      <div className='bg-white/80 backdrop-blur-sm rounded-xl border border-violet-100 overflow-hidden'>
        <p className='px-5 py-3 text-sm font-medium text-gray-800 border-b border-gray-100'>
          {creatives.length} creative{creatives.length === 1 ? '' : 's'}
        </p>
        {isLoading ? (
          <p className='p-6 text-sm text-gray-600'>Loading…</p>
        ) : creatives.length === 0 ? (
          <p className='p-6 text-sm text-gray-600'>No creatives yet. Add your first above.</p>
        ) : (
          <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4'>
            {creatives.map((c) => <CreativeCard key={c._id} c={c} onChanged={refresh} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function CreateForm({ brands, onCreated }: { brands: Brand[]; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [brandId, setBrandId] = useState('');
  const [type, setType] = useState<'banner' | 'text'>('banner');
  const [name, setName] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [landingPath, setLandingPath] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const reset = () => {
    setBrandId(''); setType('banner'); setName(''); setImageUrl('');
    setWidth(''); setHeight(''); setLandingPath(''); setBody('');
  };

  const submit = async () => {
    if (!brandId || !name.trim() || saving) return;
    setSaving(true); setError('');
    try {
      await axiosInstance.post(CREATIVES_API_URLS.CREATE(), {
        brandId, name, type,
        imageUrl: type === 'banner' ? imageUrl : undefined,
        width: type === 'banner' && width ? Number(width) : undefined,
        height: type === 'banner' && height ? Number(height) : undefined,
        landingPath: landingPath || undefined,
        body: type === 'text' ? body : undefined,
      });
      reset(); setOpen(false); onCreated();
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } } };
      setError(err.response?.data?.error || 'Failed to create.');
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className='text-sm font-medium text-white bg-primary rounded-lg px-4 py-2'>
        + Add creative
      </button>
    );
  }

  const input = 'w-full text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary';
  return (
    <div className='bg-white rounded-xl border border-violet-100 p-5 space-y-3'>
      <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
        <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className={input}>
          <option value=''>Select brand…</option>
          {brands.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
        </select>
        <div className='flex rounded-lg border border-gray-200 overflow-hidden text-sm'>
          {(['banner', 'text'] as const).map((tp) => (
            <button key={tp} onClick={() => setType(tp)}
              className={`flex-1 py-2 font-medium capitalize ${type === tp ? 'bg-primary text-white' : 'bg-white text-gray-600'}`}>
              {tp}
            </button>
          ))}
        </div>
      </div>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder='Name (e.g. Welcome 300×250)' className={input} />

      {type === 'banner' ? (
        <>
          <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder='Banner image URL (https://…)' className={input} />
          <div className='grid grid-cols-3 gap-3'>
            <input value={width} onChange={(e) => setWidth(e.target.value)} placeholder='Width px' className={input} />
            <input value={height} onChange={(e) => setHeight(e.target.value)} placeholder='Height px' className={input} />
            <input value={landingPath} onChange={(e) => setLandingPath(e.target.value)} placeholder='Landing (optional)' className={input} />
          </div>
        </>
      ) : (
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder='Text / email snippet…' className={`${input} resize-none`} />
      )}

      {error && <p className='text-xs text-red-500'>{error}</p>}
      <div className='flex justify-end gap-2'>
        <button onClick={() => { reset(); setOpen(false); }} className='h-9 px-4 rounded-lg text-sm text-gray-600 hover:bg-gray-100'>Cancel</button>
        <button onClick={submit} disabled={saving || !brandId || !name.trim()}
          className='h-9 px-5 rounded-lg text-sm font-medium text-white bg-primary disabled:opacity-40'>
          {saving ? 'Saving…' : 'Publish'}
        </button>
      </div>
    </div>
  );
}

function CreativeCard({ c, onChanged }: { c: Creative; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const archived = c.status === 'archived';

  const toggle = async () => {
    setBusy(true);
    try {
      await axiosInstance.patch(CREATIVES_API_URLS.ITEM(c._id), { status: archived ? 'active' : 'archived' });
      onChanged();
    } finally { setBusy(false); }
  };
  const del = async () => {
    if (!window.confirm(`Delete “${c.name}”?`)) return;
    setBusy(true);
    try { await axiosInstance.delete(CREATIVES_API_URLS.ITEM(c._id)); onChanged(); }
    finally { setBusy(false); }
  };

  return (
    <div className={`border rounded-xl overflow-hidden bg-white ${archived ? 'border-gray-200 opacity-60' : 'border-violet-100'}`}>
      <div className='h-32 bg-gray-50 flex items-center justify-center overflow-hidden'>
        {c.type === 'banner' && c.imageUrl
          ? <img src={c.imageUrl} alt={c.name} className='max-h-32 max-w-full object-contain' />
          : <p className='text-xs text-gray-500 px-4 line-clamp-5'>{c.body || '—'}</p>}
      </div>
      <div className='p-3 space-y-1'>
        <div className='flex items-center justify-between gap-2'>
          <p className='text-sm font-medium text-gray-800 truncate'>{c.name}</p>
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${archived ? 'bg-gray-100 text-gray-500' : 'bg-green-50 text-green-600'}`}>
            {c.status}
          </span>
        </div>
        <p className='text-xs text-gray-500'>
          {brandName(c)} · {c.type}{c.width && c.height ? ` · ${c.width}×${c.height}` : ''}
        </p>
        <div className='flex gap-2 pt-1'>
          <button onClick={toggle} disabled={busy} className='text-xs text-violet-700 hover:underline'>
            {archived ? 'Activate' : 'Archive'}
          </button>
          <button onClick={del} disabled={busy} className='text-xs text-red-500 hover:underline'>Delete</button>
        </div>
      </div>
    </div>
  );
}
