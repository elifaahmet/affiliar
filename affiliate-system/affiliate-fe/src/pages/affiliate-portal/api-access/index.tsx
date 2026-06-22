import { useState } from 'react';
import { useBaseQuery } from 'api/core/useBaseQuery';
import { useQueryClient } from '@tanstack/react-query';
import axiosInstance from 'config/axiosInstance';
import { AFFILIATE_PORTAL_API_URLS } from 'config/apiUrls';

interface ApiKeyResponse {
  apiKey: string | null;
}

const API_BASE =
  typeof window !== 'undefined'
    ? `${window.location.origin}/api/affiliate-api/v1`
    : '/api/affiliate-api/v1';

const ENDPOINTS: Array<{ method: string; path: string; desc: string }> = [
  { method: 'GET', path: '/overview', desc: 'Dashboard summary + your referral codes.' },
  { method: 'GET', path: '/campaign-reports?from=YYYY-MM-DD&to=YYYY-MM-DD', desc: 'Campaign performance (regs, FTD, deposits, NGR, players).' },
  { method: 'GET', path: '/players', desc: 'Players you referred and their activity.' },
  { method: 'GET', path: '/commission', desc: 'Your commission reports.' },
  { method: 'GET', path: '/payouts', desc: 'Your payout history.' },
  { method: 'GET', path: '/payout-balance', desc: 'Your current payable balance.' },
  { method: 'GET', path: '/referral-codes', desc: 'Your per-brand referral codes.' },
  { method: 'GET', path: '/brand-pages', desc: 'Operator-defined brand pages you can link to.' },
  { method: 'GET', path: '/links', desc: 'Tracking links you saved in Marketing Tools.' },
];

export default function AffiliateApiAccess() {
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState<string | null>(null);
  const [rotating, setRotating] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const { data, isLoading } = useBaseQuery<ApiKeyResponse>({
    endpoint: AFFILIATE_PORTAL_API_URLS.API_KEY(),
    queryKey: ['affiliate-api-key'],
  });
  const apiKey = data?.apiKey ?? null;

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(text);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const rotate = async () => {
    setRotating(true);
    try {
      await axiosInstance.post(AFFILIATE_PORTAL_API_URLS.API_KEY_ROTATE(), {});
      queryClient.invalidateQueries({ queryKey: ['affiliate-api-key'] });
      setConfirming(false);
    } catch {
      /* best-effort; the query just won't change */
    } finally {
      setRotating(false);
    }
  };

  const curlExample = apiKey
    ? `curl -H "Authorization: Bearer ${apiKey}" \\\n  ${API_BASE}/overview`
    : `curl -H "Authorization: Bearer <your-api-key>" \\\n  ${API_BASE}/overview`;

  return (
    <div className='h-full overflow-auto p-6 pb-24 space-y-6'>
      {/* API key */}
      <div className='bg-white/80 backdrop-blur-sm rounded-xl border border-violet-100 p-6'>
        <h2 className='text-sm font-semibold text-gray-800 mb-1'>API Access</h2>
        <p className='text-xs text-gray-700 mb-4'>
          Pull the same data you see in the portal into your own systems. Authenticate every
          request with your API key via the <span className='font-mono'>Authorization: Bearer</span>{' '}
          header (or <span className='font-mono'>X-Api-Key</span>). Keep this key secret — anyone with
          it can read your reporting data.
        </p>

        {isLoading ? (
          <div className='h-12 bg-gray-100 rounded-lg animate-pulse' />
        ) : !apiKey ? (
          <div className='rounded-lg border border-dashed border-gray-200 p-6 text-center space-y-3'>
            <p className='text-sm text-gray-600'>You don&apos;t have an API key yet.</p>
            <button
              type='button'
              disabled={rotating}
              onClick={rotate}
              className='px-4 py-2 text-sm rounded-lg bg-primary text-white font-medium hover:bg-primary-dark disabled:opacity-60'
            >
              {rotating ? 'Generating…' : 'Generate API key'}
            </button>
          </div>
        ) : (
          <div className='space-y-3'>
            <div className='flex items-center gap-3 p-4 rounded-lg border border-gray-100 bg-gray-50'>
              <p className='flex-1 min-w-0 text-xs text-gray-700 truncate font-mono'>{apiKey}</p>
              <button
                onClick={() => copy(apiKey)}
                className={`shrink-0 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  copied === apiKey
                    ? 'bg-green-100 text-green-700'
                    : 'bg-primary text-white hover:bg-primary-dark'
                }`}
              >
                {copied === apiKey ? 'Copied!' : 'Copy'}
              </button>
            </div>

            {confirming ? (
              <div className='flex items-center gap-2'>
                <span className='text-xs text-red-600'>
                  Regenerating revokes the old key immediately. Continue?
                </span>
                <button
                  type='button'
                  disabled={rotating}
                  onClick={rotate}
                  className='px-3 py-1.5 text-xs rounded-md bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-60'
                >
                  {rotating ? 'Regenerating…' : 'Yes, regenerate'}
                </button>
                <button
                  type='button'
                  onClick={() => setConfirming(false)}
                  className='px-3 py-1.5 text-xs rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50'
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type='button'
                onClick={() => setConfirming(true)}
                className='text-xs font-medium text-primary hover:text-primary-dark'
              >
                Regenerate key
              </button>
            )}
          </div>
        )}
      </div>

      {/* Base URL + curl */}
      <div className='bg-white/80 backdrop-blur-sm rounded-xl border border-violet-100 p-6'>
        <h2 className='text-sm font-semibold text-gray-800 mb-3'>Getting started</h2>
        <div className='space-y-3'>
          <div>
            <p className='text-xs font-semibold text-gray-700 mb-1'>Base URL</p>
            <div className='flex items-center gap-3 p-3 rounded-lg border border-gray-100 bg-gray-50'>
              <p className='flex-1 min-w-0 text-xs text-gray-700 truncate font-mono'>{API_BASE}</p>
              <button
                onClick={() => copy(API_BASE)}
                className='shrink-0 px-3 py-1.5 rounded-md text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-100'
              >
                {copied === API_BASE ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
          <div>
            <p className='text-xs font-semibold text-gray-700 mb-1'>Example request</p>
            <pre className='text-xs text-gray-700 break-all whitespace-pre-wrap font-mono bg-gray-50 rounded-md border border-gray-100 p-3'>
              {curlExample}
            </pre>
          </div>
        </div>
      </div>

      {/* Endpoints */}
      <div className='bg-white/80 backdrop-blur-sm rounded-xl border border-violet-100 p-6'>
        <h2 className='text-sm font-semibold text-gray-800 mb-3'>Endpoints</h2>
        <p className='text-xs text-gray-600 mb-4'>
          All endpoints are read-only (GET) and return JSON scoped to your account.
        </p>
        <div className='overflow-x-auto'>
          <table className='w-full'>
            <thead className='bg-gray-50'>
              <tr>
                <th className='px-4 py-2 text-left text-xs font-semibold text-gray-700'>Method</th>
                <th className='px-4 py-2 text-left text-xs font-semibold text-gray-700'>Endpoint</th>
                <th className='px-4 py-2 text-left text-xs font-semibold text-gray-700'>Description</th>
              </tr>
            </thead>
            <tbody className='divide-y divide-gray-100'>
              {ENDPOINTS.map((e) => (
                <tr key={e.path}>
                  <td className='px-4 py-2 text-xs font-semibold text-green-700'>{e.method}</td>
                  <td className='px-4 py-2 text-xs text-gray-700 font-mono break-all'>{e.path}</td>
                  <td className='px-4 py-2 text-xs text-gray-600'>{e.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Real-time postback */}
      <PostbackSection />
    </div>
  );
}

interface PostbackConfig {
  enabled: boolean;
  url: string;
  events: string[];
  supportedEvents: string[];
  macros: string[];
}
interface PostbackDelivery {
  _id: string;
  event: string;
  playerId: string | null;
  clickId: string | null;
  amountCents: number;
  currency: string | null;
  status: 'pending' | 'sent' | 'failed';
  attempts: number;
  responseStatus: number | null;
  finalUrl: string | null;
  lastError: string | null;
  createdAt: string;
  sentAt: string | null;
}
interface DeliveriesResponse { deliveries: PostbackDelivery[] }

const EVENT_LABELS: Record<string, string> = {
  registration: 'Registration',
  ftd: 'First deposit (FTD)',
  deposit: 'Every deposit',
};
const PB_STATUS_TONE: Record<string, string> = {
  sent: 'bg-green-50 text-green-700',
  pending: 'bg-amber-50 text-amber-700',
  failed: 'bg-red-50 text-red-700',
};

function PostbackSection() {
  const queryClient = useQueryClient();
  const { data: cfg, isLoading } = useBaseQuery<PostbackConfig>({
    endpoint: AFFILIATE_PORTAL_API_URLS.POSTBACK(),
    queryKey: ['affiliate-postback-config'],
  });
  const { data: del } = useBaseQuery<DeliveriesResponse>({
    endpoint: AFFILIATE_PORTAL_API_URLS.POSTBACK_DELIVERIES(),
    queryKey: ['affiliate-postback-deliveries'],
    params: { limit: 25 },
  });

  const [url, setUrl] = useState<string | null>(null);
  const [events, setEvents] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  // Local state falls back to server values until the user edits.
  const urlValue = url ?? cfg?.url ?? '';
  const eventsValue = events ?? cfg?.events ?? [];
  const supported = cfg?.supportedEvents ?? ['registration', 'ftd', 'deposit'];
  const macros = cfg?.macros ?? [];
  const deliveries = del?.deliveries ?? [];

  const toggleEvent = (e: string) =>
    setEvents((cur) => {
      const base = cur ?? cfg?.events ?? [];
      return base.includes(e) ? base.filter((x) => x !== e) : [...base, e];
    });

  const patch = async (body: Record<string, unknown>, msg: string) => {
    setSaving(true);
    setSavedMsg(null);
    try {
      await axiosInstance.patch(AFFILIATE_PORTAL_API_URLS.POSTBACK(), body);
      queryClient.invalidateQueries({ queryKey: ['affiliate-postback-config'] });
      setUrl(null);
      setEvents(null);
      setSavedMsg(msg);
      setTimeout(() => setSavedMsg(null), 2500);
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Could not save postback settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className='bg-white/80 backdrop-blur-sm rounded-xl border border-violet-100 p-6 space-y-4'>
      <div className='flex items-start justify-between gap-3'>
        <div>
          <h2 className='text-sm font-semibold text-gray-800'>Real-time Postback (S2S)</h2>
          <p className='text-xs text-gray-700 mt-1'>
            Get a server-to-server callback the moment a conversion happens, so your own tracker
            stays in sync. We send an HTTP <span className='font-mono'>GET</span> to your URL with the
            macros below filled in.
          </p>
        </div>
        {!isLoading && (
          <label className='flex items-center gap-2 shrink-0 cursor-pointer'>
            <span className='text-xs font-medium text-gray-700'>{cfg?.enabled ? 'On' : 'Off'}</span>
            <input
              type='checkbox'
              checked={!!cfg?.enabled}
              disabled={saving}
              onChange={(e) => patch({ enabled: e.target.checked }, e.target.checked ? 'Postback enabled' : 'Postback disabled')}
              className='h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary'
            />
          </label>
        )}
      </div>

      {isLoading ? (
        <div className='h-12 bg-gray-100 rounded-lg animate-pulse' />
      ) : (
        <>
          <div>
            <label className='block text-xs font-semibold text-gray-700 mb-1'>Postback URL</label>
            <input
              value={urlValue}
              onChange={(e) => setUrl(e.target.value)}
              placeholder='https://track.example.com/pb?cid={click_id}&event={event}&payout={amount}'
              className='w-full text-xs rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary font-mono'
            />
          </div>

          <div>
            <p className='block text-xs font-semibold text-gray-700 mb-1.5'>Fire on</p>
            <div className='flex flex-wrap gap-3'>
              {supported.map((e) => (
                <label key={e} className='flex items-center gap-2 text-xs text-gray-700 cursor-pointer'>
                  <input
                    type='checkbox'
                    checked={eventsValue.includes(e)}
                    onChange={() => toggleEvent(e)}
                    className='rounded border-gray-300 text-primary focus:ring-primary'
                  />
                  {EVENT_LABELS[e] ?? e}
                </label>
              ))}
            </div>
          </div>

          <div className='flex items-center gap-3'>
            <button
              type='button'
              disabled={saving}
              onClick={() => patch({ url: urlValue, events: eventsValue }, 'Saved')}
              className='px-4 py-2 text-sm rounded-lg bg-primary text-white font-medium hover:bg-primary-dark disabled:opacity-60'
            >
              {saving ? 'Saving…' : 'Save postback settings'}
            </button>
            {savedMsg && <span className='text-xs text-green-700'>{savedMsg}</span>}
          </div>

          <div>
            <p className='text-xs font-semibold text-gray-700 mb-1.5'>Macros</p>
            <div className='flex flex-wrap gap-1.5'>
              {macros.map((m) => (
                <code key={m} className='text-[11px] bg-gray-100 text-gray-700 rounded px-1.5 py-0.5'>{`{${m}}`}</code>
              ))}
            </div>
          </div>

          {/* Recent deliveries */}
          <div>
            <p className='text-xs font-semibold text-gray-700 mb-2'>Recent deliveries</p>
            {deliveries.length === 0 ? (
              <p className='text-xs text-gray-500'>No postbacks sent yet.</p>
            ) : (
              <div className='overflow-x-auto'>
                <table className='w-full'>
                  <thead className='bg-gray-50'>
                    <tr>
                      <th className='px-3 py-2 text-left text-[11px] font-semibold text-gray-700'>When</th>
                      <th className='px-3 py-2 text-left text-[11px] font-semibold text-gray-700'>Event</th>
                      <th className='px-3 py-2 text-left text-[11px] font-semibold text-gray-700'>Click ID</th>
                      <th className='px-3 py-2 text-left text-[11px] font-semibold text-gray-700'>Status</th>
                      <th className='px-3 py-2 text-left text-[11px] font-semibold text-gray-700'>HTTP</th>
                    </tr>
                  </thead>
                  <tbody className='divide-y divide-gray-100'>
                    {deliveries.map((d) => (
                      <tr key={d._id}>
                        <td className='px-3 py-2 text-[11px] text-gray-600 whitespace-nowrap'>{new Date(d.createdAt).toLocaleString()}</td>
                        <td className='px-3 py-2 text-[11px] text-gray-700'>{EVENT_LABELS[d.event] ?? d.event}</td>
                        <td className='px-3 py-2 text-[11px] text-gray-600 font-mono truncate max-w-[140px]' title={d.clickId ?? ''}>{d.clickId || '—'}</td>
                        <td className='px-3 py-2'>
                          <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-medium ${PB_STATUS_TONE[d.status] ?? 'bg-gray-100 text-gray-600'}`}>
                            {d.status}{d.status !== 'sent' && d.attempts > 0 ? ` ·${d.attempts}` : ''}
                          </span>
                        </td>
                        <td className='px-3 py-2 text-[11px] text-gray-600' title={d.lastError ?? ''}>{d.responseStatus ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
