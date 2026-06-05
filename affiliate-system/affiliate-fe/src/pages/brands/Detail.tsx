import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { useBaseQuery } from 'api/core/useBaseQuery';
import { useBaseMutation } from 'api/core/useBaseMutation';
import { BRANDS_API_URLS } from 'config/apiUrls';

import BrandPagesTab from './BrandPagesTab';

interface Brand {
  _id: string;
  id: number;
  name: string;
  url: string | null;
  enabled: boolean;
}

interface BrandsResponse {
  brands: Brand[];
}

type Tab = 'details' | 'pages';

const inputClass =
  'w-full text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary';

// Details form lives in its own component so its state initializes cleanly
// from the loaded brand (mounted only once the brand is available).
function DetailsForm({ brand, onSaved }: { brand: Brand; onSaved: () => void }) {
  const [name, setName] = useState(brand.name);
  const [url, setUrl] = useState(brand.url ?? '');
  const [enabled, setEnabled] = useState(brand.enabled);
  const [error, setError] = useState('');

  const updateMutation = useBaseMutation({
    endpoint: BRANDS_API_URLS.UPDATE(brand._id),
    method: 'patch',
    invalidateKeys: ['brands-page'],
    onSuccess: () => onSaved(),
    onError: (e: any) => setError(e?.message ?? 'Failed to update brand'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    updateMutation.mutate({ name: name.trim(), url: url.trim() || null, enabled });
  };

  return (
    <form onSubmit={handleSubmit} className='space-y-4 max-w-lg'>
      <div>
        <label className='block text-xs font-medium text-gray-600 mb-1'>Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
          placeholder='Pixup Play'
        />
      </div>

      <div>
        <label className='block text-xs font-medium text-gray-600 mb-1'>URL</label>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className={inputClass}
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

      <div className='pt-1'>
        <button
          type='submit'
          disabled={updateMutation.isPending}
          className='px-4 py-2 text-sm rounded-lg bg-primary text-white font-medium hover:bg-primary-dark disabled:opacity-60'
        >
          {updateMutation.isPending ? 'Saving...' : 'Save'}
        </button>
      </div>
    </form>
  );
}

export default function BrandDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('details');

  const { data, isLoading } = useBaseQuery<BrandsResponse>({
    endpoint: BRANDS_API_URLS.LIST(),
    queryKey: ['brands-page'],
  });

  const brand = useMemo(
    () => (data?.brands ?? []).find((b) => b._id === id),
    [data, id],
  );

  const goBack = () => navigate('/brands');

  return (
    <div className='h-full overflow-auto p-6 pb-24 space-y-6'>
      {/* Header + back */}
      <div className='flex items-center gap-3'>
        <button
          onClick={goBack}
          className='inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50'
        >
          <ArrowLeftIcon className='h-4 w-4' />
          Back
        </button>
        <h1 className='text-xl font-semibold text-gray-800'>
          {brand ? brand.name : 'Brand'}
        </h1>
      </div>

      {isLoading ? (
        <p className='text-sm text-gray-600'>Loading...</p>
      ) : !brand ? (
        <p className='text-sm text-gray-600'>Brand not found.</p>
      ) : (
        <div className='bg-white/80 backdrop-blur-sm rounded-xl border border-violet-100 p-6 space-y-5'>
          {/* Tabs */}
          <div className='flex gap-1 border-b border-gray-100'>
            {(['details', 'pages'] as Tab[]).map((k) => (
              <button
                key={k}
                type='button'
                onClick={() => setTab(k)}
                className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  tab === k
                    ? 'border-primary text-primary'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {k === 'details' ? 'Details' : 'Pages'}
              </button>
            ))}
          </div>

          {tab === 'details' ? (
            <DetailsForm brand={brand} onSaved={goBack} />
          ) : (
            <BrandPagesTab brandId={brand._id} />
          )}
        </div>
      )}
    </div>
  );
}
