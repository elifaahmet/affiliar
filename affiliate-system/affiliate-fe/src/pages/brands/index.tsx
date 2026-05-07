import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useBaseQuery } from 'api/core/useBaseQuery';
import { useBaseMutation } from 'api/core/useBaseMutation';
import { PlusIcon } from '@heroicons/react/24/outline';
import { BRANDS_API_URLS } from 'config/apiUrls';

interface Brand {
  _id: string;
  id: number;
  name: string;
  url: string | null;
  enabled: boolean;
}

interface BrandsResponse { brands: Brand[]; }

// ── modal ─────────────────────────────────────────────────────────────────────

interface ModalProps {
  brand?: Brand;          // undefined → create mode; defined → edit
  onClose: () => void;
  onSaved: () => void;
}

function BrandModal({ brand, onClose, onSaved }: ModalProps) {
  const isEdit = !!brand;
  const [name, setName]       = useState(brand?.name ?? '');
  const [url, setUrl]         = useState(brand?.url ?? '');
  const [enabled, setEnabled] = useState(brand?.enabled ?? true);
  const [error, setError]     = useState('');

  const updateMutation = useBaseMutation({
    endpoint: BRANDS_API_URLS.UPDATE(brand?._id ?? ''),
    method: 'patch',
    onSuccess: () => { onSaved(); onClose(); },
    onError: (e: any) => setError(e?.message ?? 'Failed to update brand'),
  });

  const createMutation = useBaseMutation({
    endpoint: BRANDS_API_URLS.CREATE(),
    method: 'post',
    onSuccess: () => { onSaved(); onClose(); },
    onError: (e: any) => setError(e?.message ?? 'Failed to create brand'),
  });

  const saving = isEdit ? updateMutation.isPending : createMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) { setError('Name is required'); return; }
    const payload = { name: name.trim(), url: url.trim() || null, enabled };
    if (isEdit) updateMutation.mutate(payload);
    else        createMutation.mutate(payload);
  };

  return createPortal(
    <div className='fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4'>
      <div className='bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-5'>
        <h2 className='text-base font-semibold text-gray-800'>
          {isEdit ? 'Edit Brand' : 'Add Brand'}
        </h2>

        <form onSubmit={handleSubmit} className='space-y-4'>
          <div>
            <label className='block text-xs font-medium text-gray-600 mb-1'>Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className='w-full text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary'
              placeholder='Pixup Play'
              autoFocus
            />
          </div>

          <div>
            <label className='block text-xs font-medium text-gray-600 mb-1'>URL</label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className='w-full text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary'
              placeholder='https://staging.pixupplay.tech/'
            />
          </div>

          <div className='flex items-center gap-2'>
            <input
              id='enabled'
              type='checkbox'
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className='w-4 h-4 accent-primary'
            />
            <label htmlFor='enabled' className='text-sm text-gray-700'>Enabled</label>
          </div>

          {error && <p className='text-xs text-red-500'>{error}</p>}

          <div className='flex justify-end gap-2 pt-1'>
            <button
              type='button'
              onClick={onClose}
              className='px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50'
            >
              Cancel
            </button>
            <button
              type='submit'
              disabled={saving}
              className='px-4 py-2 text-sm rounded-lg bg-primary text-white font-medium hover:bg-primary-dark disabled:opacity-60'
            >
              {saving ? 'Saving...' : isEdit ? 'Save' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function Brands() {
  const [editBrand, setEditBrand] = useState<Brand | null>(null);
  const [creating, setCreating]   = useState(false);

  const { data, isLoading, refetch } = useBaseQuery<BrandsResponse>({
    endpoint: BRANDS_API_URLS.LIST(),
    queryKey: ['brands-page'],
  });

  const brands = data?.brands ?? [];

  return (
    <div className='h-full overflow-auto p-6 pb-24 space-y-6'>
      <div className='flex items-center justify-between'>
        <h1 className='text-xl font-semibold text-gray-800'>Brands</h1>
        <button
          onClick={() => setCreating(true)}
          className='inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-dark transition-colors shadow-sm shadow-primary/20'
        >
          <PlusIcon className='h-4 w-4' />
          Add Brand
        </button>
      </div>

      <div className='bg-white/80 backdrop-blur-sm rounded-xl border border-violet-100 overflow-hidden'>
        {isLoading && <p className='text-sm text-gray-400 px-5 py-4'>Loading...</p>}

        {!isLoading && brands.length === 0 && (
          <div className='px-5 py-12 text-center space-y-3'>
            <p className='text-sm text-gray-500'>No brands yet.</p>
            <button
              onClick={() => setCreating(true)}
              className='inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary-dark'
            >
              <PlusIcon className='h-4 w-4' />
              Add your first brand
            </button>
          </div>
        )}

        {brands.length > 0 && (
          <div className='overflow-x-auto'>
            <table className='w-full'>
              <thead className='bg-gray-50'>
                <tr>
                  {['ID', 'Name', 'URL', 'Enabled', ''].map((h) => (
                    <th
                      key={h}
                      className='px-5 py-3 text-left text-xs font-semibold text-gray-500 border-r border-gray-100 last:border-r-0'
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {brands.map((b, i) => (
                  <tr key={b._id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className='px-5 py-3 text-xs text-gray-500 border-r border-gray-100 w-16'>{b.id}</td>
                    <td className='px-5 py-3 text-xs font-medium text-gray-800 border-r border-gray-100'>{b.name}</td>
                    <td className='px-5 py-3 text-xs text-gray-600 border-r border-gray-100'>
                      {b.url ? (
                        <a href={b.url} target='_blank' rel='noreferrer' className='hover:underline text-primary'>
                          {b.url}
                        </a>
                      ) : '—'}
                    </td>
                    <td className='px-5 py-3 border-r border-gray-100 w-20'>
                      {b.enabled
                        ? <span className='text-green-600 font-bold text-base'>✓</span>
                        : <span className='text-gray-300 font-bold text-base'>✕</span>}
                    </td>
                    <td className='px-5 py-3 w-16'>
                      <button
                        onClick={() => setEditBrand(b)}
                        className='text-xs text-primary font-medium hover:underline'
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editBrand && (
        <BrandModal brand={editBrand} onClose={() => setEditBrand(null)} onSaved={() => refetch()} />
      )}

      {creating && (
        <BrandModal onClose={() => setCreating(false)} onSaved={() => refetch()} />
      )}
    </div>
  );
}
