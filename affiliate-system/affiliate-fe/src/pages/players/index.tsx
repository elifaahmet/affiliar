import { useState, useRef } from 'react';
import { useBaseQuery } from 'api/core/useBaseQuery';
import { useBaseMutation } from 'api/core/useBaseMutation';
import { AFFILIATE_PLAYERS_API_URLS } from 'config/apiUrls';
import BSelectWithSearch from '@components/core-components/selectWithInput/BSelectWithSearch';

// ── types ─────────────────────────────────────────────────────────────────────

interface AffiliatePlayer {
  _id: string;
  playerId: string;
  affiliateCode: string | null;
  affiliateId?: { _id: string; username: string; email: string } | null;
  brandId: string | null;
  campaign: string | null;
  subId: string | null;
  country: string | null;
  currency: string | null;
  registeredAt: string | null;
  source: 'realtime' | 'bulk' | 'csv';
  importedAt: string;
}

interface PlayersResponse {
  players: AffiliatePlayer[];
  total: number;
  page: number;
  limit: number;
}

interface AffiliateOption {
  _id: string;
  username: string;
  email: string;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function fmt(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function sourceBadge(source: string) {
  const map: Record<string, string> = {
    realtime: 'bg-violet-100 text-violet-700',
    bulk: 'bg-fuchsia-100 text-fuchsia-700',
    csv: 'bg-green-100 text-green-700',
  };
  return `inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
    map[source] ?? 'bg-gray-100 text-gray-600'
  }`;
}

const PAGE_SIZE = 50;

function todayYMD() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function monthStartYMD() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

const CSV_TEMPLATE =
  'playerId,affiliateCode,brandId,campaign,subId,country,currency,registeredAt\n' +
  'player_001,ABCD1234,,campaign_a,,TR,USD,2025-01-15T10:00:00Z\n' +
  'player_002,XYZ56789,,,,DE,EUR,2025-01-16T09:30:00Z\n';

// ── tabs ──────────────────────────────────────────────────────────────────────

const TABS = ['Players', 'Import Players'] as const;
type Tab = (typeof TABS)[number];

// ── Players List Tab ──────────────────────────────────────────────────────────

function PlayersTab() {
  const [affiliateCode, setAffiliateCode] = useState('');
  const [playerId, setPlayerId]           = useState('');
  const [from, setFrom]                   = useState(monthStartYMD);
  const [to, setTo]                       = useState(todayYMD);
  const [page, setPage]                   = useState(1);

  const params: Record<string, any> = { page, limit: PAGE_SIZE };
  if (affiliateCode) params.affiliateCode = affiliateCode;
  if (playerId)      params.playerId = playerId;
  if (from)          params.from = from;
  if (to)            params.to = to;

  const { data, isLoading, refetch } = useBaseQuery<PlayersResponse>({
    endpoint: AFFILIATE_PLAYERS_API_URLS.LIST(),
    queryKey: ['affiliate-players', params],
    params,
  });

  const { data: affiliatesRaw } = useBaseQuery<AffiliateOption[]>({
    endpoint: AFFILIATE_PLAYERS_API_URLS.AFFILIATES_SELECT(),
    queryKey: ['affiliates-select'],
  });

  const affiliateOptions = [
    { label: 'All affiliates', value: '' },
    ...(affiliatesRaw ?? []).map((a) => ({
      label: `${a.username} (${a.email})`,
      value: a.username,
    })),
  ];

  const players = data?.players ?? [];
  const total   = data?.total ?? 0;
  const pages   = Math.ceil(total / PAGE_SIZE);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    refetch();
  };

  return (
    <div className='space-y-4'>
      {/* Filters */}
      <form onSubmit={handleSearch} className='flex flex-wrap gap-3 items-end'>
        <div className='flex flex-col gap-1'>
          <label className='text-xs text-gray-700 font-medium'>Affiliate</label>
          <div className='w-72'>
            <BSelectWithSearch
              value={affiliateCode}
              onChange={(v) => {
                setAffiliateCode(v);
                setPage(1);
              }}
              options={affiliateOptions}
              placeholder='All affiliates'
            />
          </div>
        </div>

        <div className='flex flex-col gap-1'>
          <label className='text-xs text-gray-700 font-medium'>Player ID</label>
          <input
            type='text'
            value={playerId}
            onChange={(e) => setPlayerId(e.target.value)}
            placeholder='Search by player ID…'
            className='h-9 text-sm rounded-lg border border-gray-200 px-3 focus:outline-none focus:border-primary w-64'
          />
        </div>

        <div className='flex flex-col gap-1'>
          <label className='text-xs text-gray-700 font-medium'>Registered from</label>
          <input
            type='date'
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
            className='h-9 text-sm rounded-lg border border-gray-200 px-3 focus:outline-none focus:border-primary'
          />
        </div>

        <div className='flex flex-col gap-1'>
          <label className='text-xs text-gray-700 font-medium'>To</label>
          <input
            type='date'
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
            className='h-9 text-sm rounded-lg border border-gray-200 px-3 focus:outline-none focus:border-primary'
          />
        </div>

        <button
          type='submit'
          className='h-9 px-4 text-sm bg-primary text-white rounded-lg font-medium hover:bg-primary/90'
        >
          Search
        </button>
      </form>

      {/* Table */}
      <div className='bg-white/80 backdrop-blur-sm rounded-xl border border-violet-100 overflow-hidden'>
        {isLoading && (
          <p className='text-sm text-gray-600 px-5 py-6 text-center'>Loading…</p>
        )}

        {!isLoading && players.length === 0 && (
          <p className='text-sm text-gray-600 px-5 py-10 text-center'>
            No players found. Import players using the &quot;Import Players&quot; tab.
          </p>
        )}

        {players.length > 0 && (
          <>
            <div className='overflow-x-auto'>
              <table className='w-full'>
                <thead className='bg-gray-50'>
                  <tr>
                    {[
                      'Player ID',
                      'Affiliate',
                      'Code',
                      'Campaign',
                      'Sub ID',
                      'Brand',
                      'Country',
                      'Currency',
                      'Registered',
                      'Source',
                    ].map((h) => (
                      <th
                        key={h}
                        className='px-4 py-3 text-left text-xs font-semibold text-gray-700 border-r border-gray-100 last:border-r-0 whitespace-nowrap'
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {players.map((p, i) => (
                    <tr key={p._id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className='px-4 py-2.5 text-xs font-mono text-gray-700 border-r border-gray-100 whitespace-nowrap'>
                        {p.playerId}
                      </td>
                      <td className='px-4 py-2.5 text-xs text-gray-600 border-r border-gray-100 whitespace-nowrap'>
                        {p.affiliateId ? p.affiliateId.username : '—'}
                      </td>
                      <td className='px-4 py-2.5 text-xs font-mono text-gray-700 border-r border-gray-100 whitespace-nowrap'>
                        {p.affiliateCode ?? '—'}
                      </td>
                      <td className='px-4 py-2.5 text-xs text-gray-600 border-r border-gray-100'>
                        {p.campaign ?? '—'}
                      </td>
                      <td className='px-4 py-2.5 text-xs text-gray-600 border-r border-gray-100'>
                        {p.subId ?? '—'}
                      </td>
                      <td className='px-4 py-2.5 text-xs text-gray-600 border-r border-gray-100'>
                        {p.brandId ?? '—'}
                      </td>
                      <td className='px-4 py-2.5 text-xs text-gray-600 border-r border-gray-100'>
                        {p.country ?? '—'}
                      </td>
                      <td className='px-4 py-2.5 text-xs text-gray-600 border-r border-gray-100'>
                        {p.currency ?? '—'}
                      </td>
                      <td className='px-4 py-2.5 text-xs text-gray-700 border-r border-gray-100 whitespace-nowrap'>
                        {fmt(p.registeredAt)}
                      </td>
                      <td className='px-4 py-2.5'>
                        <span className={sourceBadge(p.source)}>{p.source}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {pages > 1 && (
              <div className='flex items-center justify-between px-5 py-3 border-t border-gray-100'>
                <p className='text-xs text-gray-600'>
                  {total} players · page {page} of {pages}
                </p>
                <div className='flex gap-2'>
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className='px-3 py-1.5 text-xs rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50'
                  >
                    Prev
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(pages, p + 1))}
                    disabled={page === pages}
                    className='px-3 py-1.5 text-xs rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50'
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Import Players Tab ────────────────────────────────────────────────────────

function ImportPlayersTab() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows]             = useState<Record<string, string>[]>([]);
  const [filename, setFilename]     = useState('');
  const [parseError, setParseError] = useState('');
  const [result, setResult]         = useState<{ created: number; failed: any[] } | null>(null);

  const { mutate: bulkImport, isPending } = useBaseMutation({
    endpoint: AFFILIATE_PLAYERS_API_URLS.BULK_REGISTER(),
    method: 'post',
    onSuccess: (data: any) => {
      setResult(data);
      setRows([]);
      setFilename('');
    },
    onError: (e: any) => {
      setParseError(e?.response?.data?.error ?? e?.message ?? 'Import failed');
    },
  });

  function parseCSV(text: string): Record<string, string>[] {
    const lines = text.trim().split('\n').filter(Boolean);
    if (lines.length < 2) {
      throw new Error('CSV must have a header row and at least one data row');
    }
    const headers = lines[0].split(',').map((h) => h.trim());
    return lines.slice(1).map((line) => {
      const values = line.split(',').map((v) => v.trim());
      const row: Record<string, string> = {};
      headers.forEach((h, i) => {
        row[h] = values[i] ?? '';
      });
      return row;
    });
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    setParseError('');
    setResult(null);
    setRows([]);
    const file = e.target.files?.[0];
    if (!file) return;
    setFilename(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = parseCSV(ev.target?.result as string);
        setRows(parsed);
      } catch (err: any) {
        setParseError(err.message);
      }
    };
    reader.readAsText(file);
  }

  function handleImport() {
    if (!rows.length) return;
    setResult(null);
    setParseError('');
    const payload = rows.map((r) => ({
      playerId:      r.playerId      || r.player_id,
      affiliateCode: r.affiliateCode || r.affiliate_code || null,
      brandId:       r.brandId       || r.brand_id       || null,
      campaign:      r.campaign      || null,
      subId:         r.subId         || r.sub_id         || null,
      country:       r.country       || null,
      currency:      r.currency      || null,
      registeredAt:  r.registeredAt  || r.registered_at  || null,
    }));
    bulkImport(payload as any);
  }

  function downloadTemplate() {
    const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'players_import_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  const previewRows = rows.slice(0, 5);
  const headers     = rows.length > 0 ? Object.keys(rows[0]) : [];

  return (
    <div className='grid grid-cols-2 gap-6 items-start'>
      {/* Left column — upload */}
      <div className='space-y-5'>
        <div className='flex items-center justify-between'>
          <div>
            <h3 className='text-sm font-semibold text-gray-800'>Bulk Import Players</h3>
            <p className='text-xs text-gray-600 mt-0.5'>
              Upload a CSV to link existing players to affiliates. Duplicate player IDs are upserted.
            </p>
          </div>
          <button
            onClick={downloadTemplate}
            className='text-xs text-primary font-medium hover:underline shrink-0 ml-4'
          >
            Download template
          </button>
        </div>

        <div className='bg-violet-50 rounded-lg px-4 py-3 text-xs text-violet-700 space-y-1'>
          <p className='font-semibold'>CSV columns</p>
          <p>
            <span className='font-medium'>Required:</span> playerId, affiliateCode
          </p>
          <p>
            <span className='font-medium'>Optional:</span> brandId, campaign, subId, country,
            currency, registeredAt (ISO 8601)
          </p>
        </div>

        <div
          className='border-2 border-dashed border-gray-200 rounded-xl p-10 text-center cursor-pointer hover:border-primary/40 transition-colors'
          onClick={() => fileRef.current?.click()}
        >
          <p className='text-sm text-gray-700'>
            {filename ? (
              <>
                <span className='font-medium text-gray-800'>{filename}</span>
                {rows.length > 0 && (
                  <span className='text-gray-600'> — {rows.length} rows</span>
                )}
              </>
            ) : (
              'Click to select a CSV file'
            )}
          </p>
          <input ref={fileRef} type='file' accept='.csv' className='hidden' onChange={handleFile} />
        </div>

        {parseError && <p className='text-xs text-red-500'>{parseError}</p>}

        {rows.length > 0 && (
          <button
            onClick={handleImport}
            disabled={isPending}
            className='w-full py-2.5 text-sm bg-primary text-white rounded-xl font-medium hover:bg-primary/90 disabled:opacity-60'
          >
            {isPending ? 'Importing…' : `Import ${rows.length} players`}
          </button>
        )}
      </div>

      {/* Right column — preview + result */}
      <div className='space-y-4'>
        {previewRows.length > 0 && (
          <div className='bg-white rounded-xl border border-gray-100 overflow-hidden'>
            <p className='text-xs text-gray-700 px-4 py-2 border-b border-gray-100'>
              Preview (first {previewRows.length} of {rows.length} rows)
            </p>
            <div className='overflow-x-auto'>
              <table className='w-full'>
                <thead className='bg-gray-50'>
                  <tr>
                    {headers.map((h) => (
                      <th
                        key={h}
                        className='px-4 py-2 text-left text-xs font-semibold text-gray-700 border-r border-gray-100 last:border-r-0 whitespace-nowrap'
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      {headers.map((h) => (
                        <td
                          key={h}
                          className='px-4 py-2 text-xs text-gray-600 border-r border-gray-100 last:border-r-0 whitespace-nowrap'
                        >
                          {row[h] || '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {result && (
          <div className='space-y-3'>
            <div className='bg-green-50 rounded-lg px-4 py-3 text-sm text-green-700'>
              <span className='font-semibold'>{result.created}</span> players imported successfully.
            </div>

            {result.failed.length > 0 && (
              <div className='bg-red-50 rounded-lg px-4 py-3 space-y-1'>
                <p className='text-xs font-semibold text-red-700'>
                  {result.failed.length} failed:
                </p>
                {result.failed.slice(0, 20).map((f: any, i: number) => (
                  <p key={i} className='text-xs text-red-600'>
                    {f.playerId}: {f.error}
                  </p>
                ))}
                {result.failed.length > 20 && (
                  <p className='text-xs text-red-400'>…and {result.failed.length - 20} more</p>
                )}
              </div>
            )}
          </div>
        )}

        {!previewRows.length && !result && (
          <div className='h-full flex items-center justify-center min-h-[200px]'>
            <p className='text-xs text-gray-300'>Preview will appear here after selecting a file</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Players() {
  const [activeTab, setActiveTab] = useState<Tab>('Players');

  return (
    <div className='h-full overflow-auto p-6 pb-24 space-y-5'>
      <h1 className='text-xl font-semibold text-gray-800'>Players</h1>

      <div className='flex gap-1 bg-white rounded-xl p-1 shadow-sm border border-gray-100 w-full'>
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab ? 'bg-primary text-white' : 'text-gray-700 hover:text-gray-700'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'Players' && <PlayersTab />}
      {activeTab === 'Import Players' && <ImportPlayersTab />}
    </div>
  );
}
