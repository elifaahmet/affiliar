import { useState } from 'react';
import { useBaseQuery } from 'api/core/useBaseQuery';
import { useBaseMutation } from 'api/core/useBaseMutation';
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
  brand?: Brand;
  onClose: () => void;
  onSaved: () => void;
}

function BrandModal({ brand, onClose, onSaved }: ModalProps) {
  const [name, setName]       = useState(brand?.name ?? '');
  const [url, setUrl]         = useState(brand?.url ?? '');
  const [enabled, setEnabled] = useState(brand?.enabled ?? true);
  const [error, setError]     = useState('');

  const { mutate: update, isPending: saving } = useBaseMutation({
    endpoint: BRANDS_API_URLS.UPDATE(brand?._id ?? ''),
    method: 'patch',
    onSuccess: () => { onSaved(); onClose(); },
    onError: (e: any) => setError(e?.message ?? 'Failed to update brand'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) { setError('Name is required'); return; }
    const payload = { name: name.trim(), url: url.trim() || null, enabled };
    update(payload);
  };

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/30'>
      <div className='bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-5'>
        <h2 className='text-base font-semibold text-gray-800'>Edit Brand</h2>

        <form onSubmit={handleSubmit} className='space-y-4'>
          <div>
            <label className='block text-xs font-medium text-gray-600 mb-1'>Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className='w-full text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary'
              placeholder='Pixup Play'
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
              className='px-4 py-2 text-sm rounded-lg bg-primary text-white font-medium hover:bg-primary/90 disabled:opacity-60'
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function Brands() {
  const [editBrand, setEditBrand] = useState<Brand | null>(null);

  const { data, isLoading, refetch } = useBaseQuery<BrandsResponse>({
    endpoint: BRANDS_API_URLS.LIST(),
    queryKey: ['brands-page'],
  });

  const brands = data?.brands ?? [];

  return (
    <div className='bg-gray-100 h-full overflow-auto p-6 pb-24 space-y-6'>
      <h1 className='text-xl font-semibold text-gray-800'>Brands</h1>

      <div className='bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden'>
        {isLoading && <p className='text-sm text-gray-400 px-5 py-4'>Loading...</p>}

        {!isLoading && brands.length === 0 && (
          <p className='text-sm text-gray-400 px-5 py-6 text-center'>
            No brands yet. Add your first brand to get started.
          </p>
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
    </div>
  );
}
