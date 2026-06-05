import { useState } from 'react';
import { useBaseQuery } from 'api/core/useBaseQuery';
import axiosInstance from 'config/axiosInstance';
import { BRAND_PAGES_API_URLS } from 'config/apiUrls';
import { PencilSquareIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';

export interface BrandPage {
  _id: string;
  brandId: string;
  name: string;
  url: string | null;
  description: string | null;
  enabled: boolean;
}

interface PagesResponse {
  pages: BrandPage[];
}

interface Props {
  brandId: string;
}

interface DraftFields {
  name: string;
  url: string;
  description: string;
  enabled: boolean;
}

const EMPTY: DraftFields = { name: '', url: '', description: '', enabled: true };

const inputClass =
  'w-full text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary';

export default function BrandPagesTab({ brandId }: Props) {
  const { data, isLoading, refetch } = useBaseQuery<PagesResponse>({
    endpoint: BRAND_PAGES_API_URLS.LIST(brandId),
    queryKey: ['brand-pages', brandId],
  });
  const pages = data?.pages ?? [];

  const [draft, setDraft] = useState<DraftFields>(EMPTY);
  const [editId, setEditId] = useState<string | null>(null);
  const [edit, setEdit] = useState<DraftFields>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const toPayload = (f: DraftFields) => ({
    name: f.name.trim(),
    url: f.url.trim() || null,
    description: f.description.trim() || null,
    enabled: f.enabled,
  });

  const addPage = async () => {
    if (!draft.name.trim()) {
      setError('Name is required');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await axiosInstance.post(BRAND_PAGES_API_URLS.CREATE(brandId), toPayload(draft));
      setDraft(EMPTY);
      await refetch();
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Failed to add page');
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (p: BrandPage) => {
    setError('');
    setEditId(p._id);
    setEdit({
      name: p.name,
      url: p.url ?? '',
      description: p.description ?? '',
      enabled: p.enabled,
    });
  };

  const saveEdit = async (pageId: string) => {
    if (!edit.name.trim()) {
      setError('Name is required');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await axiosInstance.patch(BRAND_PAGES_API_URLS.UPDATE(brandId, pageId), toPayload(edit));
      setEditId(null);
      await refetch();
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Failed to save page');
    } finally {
      setBusy(false);
    }
  };

  const removePage = async (pageId: string) => {
    setBusy(true);
    setError('');
    try {
      await axiosInstance.delete(BRAND_PAGES_API_URLS.DELETE(brandId, pageId));
      if (editId === pageId) setEditId(null);
      await refetch();
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Failed to delete page');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className='space-y-4'>
      {error && <p className='text-xs text-red-500'>{error}</p>}

      {/* Existing pages */}
      {isLoading ? (
        <p className='text-sm text-gray-600'>Loading...</p>
      ) : pages.length === 0 ? (
        <p className='text-sm text-gray-500'>
          No pages yet. Add a login, register, bonus page (or anything else) below.
        </p>
      ) : (
        <div className='space-y-2'>
          {pages.map((p) =>
            editId === p._id ? (
              <div key={p._id} className='rounded-lg border border-violet-200 bg-violet-50/40 p-3 space-y-2'>
                <input
                  value={edit.name}
                  onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                  className={inputClass}
                  placeholder='Name (e.g. Login)'
                />
                <input
                  value={edit.url}
                  onChange={(e) => setEdit({ ...edit, url: e.target.value })}
                  className={inputClass}
                  placeholder='URL (https://…)'
                />
                <textarea
                  value={edit.description}
                  onChange={(e) => setEdit({ ...edit, description: e.target.value })}
                  className={inputClass}
                  rows={2}
                  placeholder='Description (optional)'
                />
                <div className='flex items-center justify-between'>
                  <label className='flex items-center gap-2 text-sm text-gray-700'>
                    <input
                      type='checkbox'
                      checked={edit.enabled}
                      onChange={(e) => setEdit({ ...edit, enabled: e.target.checked })}
                      className='w-4 h-4 accent-primary'
                    />
                    Enabled
                  </label>
                  <div className='flex gap-2'>
                    <button
                      type='button'
                      onClick={() => setEditId(null)}
                      className='px-3 py-1.5 text-xs rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50'
                    >
                      Cancel
                    </button>
                    <button
                      type='button'
                      disabled={busy}
                      onClick={() => saveEdit(p._id)}
                      className='px-3 py-1.5 text-xs rounded-lg bg-primary text-white font-medium hover:bg-primary-dark disabled:opacity-60'
                    >
                      Save
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div key={p._id} className='flex items-start gap-3 rounded-lg border border-gray-100 bg-white p-3'>
                <div className='flex-1 min-w-0'>
                  <div className='flex items-center gap-2'>
                    <span className='text-sm font-medium text-gray-800 truncate'>{p.name}</span>
                    {!p.enabled && (
                      <span className='text-[10px] uppercase tracking-wide text-gray-400 border border-gray-200 rounded px-1.5 py-0.5'>
                        Disabled
                      </span>
                    )}
                  </div>
                  {p.url && (
                    <a
                      href={p.url}
                      target='_blank'
                      rel='noreferrer'
                      className='text-xs text-primary hover:underline break-all'
                    >
                      {p.url}
                    </a>
                  )}
                  {p.description && <p className='text-xs text-gray-500 mt-0.5'>{p.description}</p>}
                </div>
                <div className='flex gap-1 shrink-0'>
                  <button
                    type='button'
                    onClick={() => startEdit(p)}
                    className='p-1.5 rounded-lg text-gray-500 hover:bg-gray-100'
                    title='Edit'
                  >
                    <PencilSquareIcon className='h-4 w-4' />
                  </button>
                  <button
                    type='button'
                    disabled={busy}
                    onClick={() => removePage(p._id)}
                    className='p-1.5 rounded-lg text-red-500 hover:bg-red-50 disabled:opacity-60'
                    title='Delete'
                  >
                    <TrashIcon className='h-4 w-4' />
                  </button>
                </div>
              </div>
            ),
          )}
        </div>
      )}

      {/* Add new page */}
      <div className='rounded-lg border border-dashed border-gray-200 p-3 space-y-2'>
        <p className='text-xs font-semibold text-gray-600'>Add a page</p>
        <input
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          className={inputClass}
          placeholder='Name (e.g. Login, Register, Bonus)'
        />
        <input
          value={draft.url}
          onChange={(e) => setDraft({ ...draft, url: e.target.value })}
          className={inputClass}
          placeholder='URL (https://…)'
        />
        <textarea
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          className={inputClass}
          rows={2}
          placeholder='Description (optional)'
        />
        <div className='flex items-center justify-between'>
          <label className='flex items-center gap-2 text-sm text-gray-700'>
            <input
              type='checkbox'
              checked={draft.enabled}
              onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
              className='w-4 h-4 accent-primary'
            />
            Enabled
          </label>
          <button
            type='button'
            disabled={busy}
            onClick={addPage}
            className='inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-primary text-white font-medium hover:bg-primary-dark disabled:opacity-60'
          >
            <PlusIcon className='h-4 w-4' />
            Add page
          </button>
        </div>
      </div>
    </div>
  );
}
