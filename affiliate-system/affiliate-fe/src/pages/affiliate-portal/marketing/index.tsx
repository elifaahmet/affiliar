import { useState, useMemo } from 'react';
import { useBaseQuery } from 'api/core/useBaseQuery';
import { useBaseMutation } from 'api/core/useBaseMutation';
import { useQueryClient } from '@tanstack/react-query';
import axiosInstance from 'config/axiosInstance';
import { AFFILIATE_PORTAL_API_URLS } from 'config/apiUrls';

interface BrandReferralCode {
  code: string;
  brandId: string | null;
  brandName: string | null;
  brandUrl: string | null;
}

interface OverviewResponse {
  referralCodes: BrandReferralCode[];
}

interface BrandPageRow {
  _id: string;
  brandId: string;
  brandName: string | null;
  brandUrl: string | null;
  code: string | null;
  name: string;
  url: string | null;
  description: string | null;
}

interface BrandPagesResponse {
  pages: BrandPageRow[];
}

interface SavedLink {
  _id: string;
  brandId: string;
  brandName: string | null;
  pageId: string | null;
  code: string;
  label: string | null;
  url: string;
  trackingUrl?: string | null;
  campaign: string | null;
  sub: string | null;
  createdAt: string;
}

interface SavedLinksResponse {
  links: SavedLink[];
}

interface CampaignReportRow {
  campaign: string;
  affiliateId: string;
  affiliateCode: string;
  registrations: number;
  ftdCount: number;
  ftdSumCents: number;
  depositsCount: number;
  depositsSumCents: number;
  ggrCents: number;
  ngrCents: number;
  playerCount: number;
}

interface CampaignReportResponse {
  rows: CampaignReportRow[];
}

function centsToEur(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function defaultRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    from: from.toISOString().slice(0, 10),
    to: now.toISOString().slice(0, 10),
  };
}

export default function AffiliateMarketing() {
  const [copied, setCopied] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState(defaultRange);
  const [selectedBrandId, setSelectedBrandId] = useState<string>('');
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [customCode, setCustomCode] = useState<string>('');
  const queryClient = useQueryClient();

  const { data, isLoading } = useBaseQuery<OverviewResponse>({
    endpoint: AFFILIATE_PORTAL_API_URLS.OVERVIEW(),
    queryKey: ['affiliate-overview-marketing'],
    params: {},
  });

  const generateMutation = useBaseMutation<{ generated: { code: string } }, { brandId: string; code?: string }>({
    endpoint: AFFILIATE_PORTAL_API_URLS.REFERRAL_CODES(),
    method: 'post',
    onSuccess: (res) => {
      setGeneratedCode(res?.generated?.code ?? null);
      setGenerateError(null);
      setCustomCode('');
      queryClient.invalidateQueries({ queryKey: ['affiliate-overview-marketing'] });
      setTimeout(() => setGeneratedCode(null), 4000);
    },
    onError: (err: any) => {
      setGenerateError(
        err?.response?.data?.error || err?.message || 'Failed to generate code',
      );
      setTimeout(() => setGenerateError(null), 4000);
    },
  });

  const campaignParams = useMemo(
    () => ({ from: dateRange.from, to: dateRange.to }),
    [dateRange.from, dateRange.to],
  );

  const { data: campaignData, isLoading: campaignLoading } = useBaseQuery<CampaignReportResponse>({
    endpoint: AFFILIATE_PORTAL_API_URLS.CAMPAIGN_REPORTS(),
    queryKey: ['affiliate-portal-campaign-reports', campaignParams],
    params: campaignParams,
  });

  const campaignRows: CampaignReportRow[] = (campaignData as any)?.rows ?? [];

  const referralCodes = data?.referralCodes ?? [];

  // Operator-defined brand pages the affiliate can target + the affiliate's
  // own saved tracking links.
  const { data: pagesData } = useBaseQuery<BrandPagesResponse>({
    endpoint: AFFILIATE_PORTAL_API_URLS.BRAND_PAGES(),
    queryKey: ['affiliate-brand-pages'],
  });
  const brandPages = pagesData?.pages ?? [];

  const { data: linksData } = useBaseQuery<SavedLinksResponse>({
    endpoint: AFFILIATE_PORTAL_API_URLS.LINKS(),
    queryKey: ['affiliate-saved-links'],
  });
  const savedLinks = linksData?.links ?? [];

  // Link builder state — selected base code + target page + tracking params.
  const [builderCode, setBuilderCode] = useState<string>('');
  const [builderPageId, setBuilderPageId] = useState<string>('');
  const [campaign, setCampaign] = useState<string>('');
  const [sub, setSub] = useState<string>('');
  const [customParams, setCustomParams] = useState<Array<{ key: string; value: string }>>([]);
  const [builderCopied, setBuilderCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const fallbackBaseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  function buildLink(rc: BrandReferralCode) {
    const base = (rc.brandUrl || fallbackBaseUrl).replace(/\/+$/, '');
    return `${base}/?affiliate=${rc.code}`;
  }

  // Brands the affiliate can generate codes for = distinct brands they're
  // already assigned. If the dropdown is empty we hide the generate UI.
  const availableBrands = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ id: string; name: string }> = [];
    for (const rc of referralCodes) {
      if (!rc.brandId || seen.has(rc.brandId)) continue;
      seen.add(rc.brandId);
      out.push({ id: rc.brandId, name: rc.brandName || rc.brandId });
    }
    return out;
  }, [referralCodes]);

  // The referral code currently selected in the builder (drives brand + code).
  const builderRc =
    referralCodes.find((r) => r.code === builderCode) ?? referralCodes[0] ?? null;

  // Pages belonging to the selected code's brand — the targets the affiliate
  // can point this link at (empty → only the brand homepage).
  const pagesForBrand = useMemo(
    () =>
      builderRc?.brandId
        ? brandPages.filter((p) => p.brandId === builderRc.brandId)
        : [],
    [brandPages, builderRc],
  );

  // Live preview of the builder link: the selected page's URL (or the brand
  // homepage) + ?affiliate=<code> + any campaign / sub / custom params.
  // Trackable smartlink: routes through Affiliar's click tracker (/api/r/:code)
  // — sub/campaign are recorded on the click, custom params ride along on the
  // landing URL, and the tracker appends affiliate + click_id before the 302.
  const builderLink = useMemo(() => {
    if (!builderRc) return '';
    const page = pagesForBrand.find((p) => p._id === builderPageId);
    const rawBase = (page?.url || builderRc.brandUrl || fallbackBaseUrl).replace(/\/+$/, '');
    const customPairs = customParams
      .map((p) => [p.key.trim(), p.value.trim()] as [string, string])
      .filter(([k, v]) => k && v && k.toLowerCase() !== 'affiliate');
    let landing = rawBase;
    if (customPairs.length > 0) {
      const joiner = rawBase.includes('?') ? '&' : '/?';
      landing =
        `${rawBase}${joiner}` +
        customPairs.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
    }
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const sp = new URLSearchParams();
    if (campaign.trim()) sp.set('campaign', campaign.trim());
    if (sub.trim()) sp.set('sub', sub.trim());
    sp.set('to', landing);
    return `${origin}/api/r/${builderRc.code}?${sp.toString()}`;
  }, [builderRc, pagesForBrand, builderPageId, campaign, sub, customParams, fallbackBaseUrl]);

  // Persist the current builder link so the affiliate can re-copy it later.
  const saveLink = async () => {
    if (!builderRc?.brandId) {
      setSaveError('This code is not linked to a brand, so it cannot be saved.');
      setTimeout(() => setSaveError(null), 4000);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await axiosInstance.post(AFFILIATE_PORTAL_API_URLS.LINKS(), {
        brandId: builderRc.brandId,
        pageId: builderPageId || null,
        campaign: campaign.trim() || null,
        sub: sub.trim() || null,
        customParams: customParams.filter((p) => p.key.trim() && p.value.trim()),
      });
      queryClient.invalidateQueries({ queryKey: ['affiliate-saved-links'] });
    } catch (e: any) {
      setSaveError(e?.response?.data?.error || e?.message || 'Failed to save link');
      setTimeout(() => setSaveError(null), 4000);
    } finally {
      setSaving(false);
    }
  };

  const deleteSavedLink = async (id: string) => {
    try {
      await axiosInstance.delete(AFFILIATE_PORTAL_API_URLS.LINK(id));
      queryClient.invalidateQueries({ queryKey: ['affiliate-saved-links'] });
    } catch {
      /* best-effort; the list just won't change */
    }
  };

  const copyBuilder = () => {
    if (!builderLink) return;
    navigator.clipboard.writeText(builderLink).then(() => {
      setBuilderCopied(true);
      setTimeout(() => setBuilderCopied(false), 2000);
    });
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(text);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  return (
    <div className='h-full overflow-auto p-6 pb-24 space-y-6'>

      {/* Campaign Performance */}
      <div className='bg-white/80 backdrop-blur-sm rounded-xl border border-violet-100 p-6'>
        <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4'>
          <div>
            <h2 className='text-sm font-semibold text-gray-800 mb-1'>Campaign Performance</h2>
            <p className='text-xs text-gray-600'>Metrics for your tracked campaigns (UTM-style identifiers).</p>
          </div>
          <div className='flex items-center gap-2'>
            <input
              type='date'
              value={dateRange.from}
              onChange={(e) => setDateRange((r) => ({ ...r, from: e.target.value }))}
              className='bg-white text-gray-700 text-xs rounded-lg px-2 py-1.5 border border-gray-200 focus:outline-none focus:border-primary shadow-sm'
            />
            <span className='text-gray-600 text-xs'>&rarr;</span>
            <input
              type='date'
              value={dateRange.to}
              onChange={(e) => setDateRange((r) => ({ ...r, to: e.target.value }))}
              className='bg-white text-gray-700 text-xs rounded-lg px-2 py-1.5 border border-gray-200 focus:outline-none focus:border-primary shadow-sm'
            />
          </div>
        </div>

        {campaignLoading && (
          <div className='space-y-3'>
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className='h-10 bg-gray-100 rounded-lg animate-pulse' />
            ))}
          </div>
        )}

        {!campaignLoading && campaignRows.length === 0 && (
          <div className='rounded-lg border border-dashed border-gray-200 p-6 text-center'>
            <p className='text-sm text-gray-600'>No campaign data for this period. Use the &ldquo;campaign&rdquo; query parameter in your referral links to start tracking.</p>
          </div>
        )}

        {!campaignLoading && campaignRows.length > 0 && (
          <div className='overflow-x-auto'>
            <table className='w-full'>
              <thead className='bg-gray-50'>
                <tr>
                  <th className='px-4 py-2 text-left text-xs font-semibold text-gray-700'>Campaign</th>
                  <th className='px-4 py-2 text-right text-xs font-semibold text-gray-700'>Regs</th>
                  <th className='px-4 py-2 text-right text-xs font-semibold text-gray-700'>FTDs</th>
                  <th className='px-4 py-2 text-right text-xs font-semibold text-gray-700'>Deposits (&euro;)</th>
                  <th className='px-4 py-2 text-right text-xs font-semibold text-gray-700'>NGR (&euro;)</th>
                  <th className='px-4 py-2 text-right text-xs font-semibold text-gray-700'>Players</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-gray-100'>
                {campaignRows.map((row, i) => (
                  <tr key={`${row.campaign}-${i}`} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className='px-4 py-2 text-xs text-gray-700 font-mono'>{row.campaign || '\u2014'}</td>
                    <td className='px-4 py-2 text-xs text-gray-700 text-right'>{row.registrations}</td>
                    <td className='px-4 py-2 text-xs text-gray-700 text-right'>{row.ftdCount}</td>
                    <td className='px-4 py-2 text-xs text-gray-700 text-right'>{centsToEur(row.depositsSumCents)}</td>
                    <td className='px-4 py-2 text-xs text-gray-700 text-right'>{centsToEur(row.ngrCents)}</td>
                    <td className='px-4 py-2 text-xs text-gray-700 text-right'>{row.playerCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Referral Links */}
      <div className='bg-white/80 backdrop-blur-sm rounded-xl border border-violet-100 p-6'>
        <div className='flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-4'>
          <div>
            <h2 className='text-sm font-semibold text-gray-800 mb-1'>Your Referral Links</h2>
            <p className='text-xs text-gray-600'>Share these links to refer new players. Each player registered through your link will be tracked to your account.</p>
          </div>

          {availableBrands.length > 0 && (
            <div className='flex items-center gap-2'>
              <select
                value={selectedBrandId || availableBrands[0]?.id || ''}
                onChange={(e) => setSelectedBrandId(e.target.value)}
                className='bg-white text-gray-700 text-xs rounded-lg px-2 py-1.5 border border-gray-200 focus:outline-none focus:border-primary shadow-sm'
              >
                {availableBrands.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              <input
                type='text'
                value={customCode}
                maxLength={20}
                onChange={(e) => setCustomCode(e.target.value.toUpperCase())}
                placeholder='Custom code (optional)'
                className='w-40 bg-white text-gray-700 text-xs font-mono uppercase tracking-wide rounded-lg px-2 py-1.5 border border-gray-200 focus:outline-none focus:border-primary shadow-sm'
              />
              <button
                type='button'
                disabled={generateMutation.isPending}
                onClick={() => {
                  const brandId = selectedBrandId || availableBrands[0]?.id;
                  if (!brandId) return;
                  const code = customCode.trim();
                  generateMutation.mutate(code ? { brandId, code } : { brandId });
                }}
                className='shrink-0 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-white hover:bg-primary-dark disabled:opacity-60 disabled:cursor-not-allowed'
              >
                {generateMutation.isPending
                  ? (customCode.trim() ? 'Adding…' : 'Generating…')
                  : (customCode.trim() ? 'Add my code' : 'Generate new code')}
              </button>
            </div>
          )}
        </div>

        {generatedCode && (
          <p className='text-xs text-green-700 mb-3'>
            Referral code ready: <span className='font-mono'>{generatedCode}</span>
          </p>
        )}
        {generateError && (
          <p className='text-xs text-red-600 mb-3'>{generateError}</p>
        )}

        {isLoading && (
          <div className='space-y-3'>
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className='h-14 bg-gray-100 rounded-lg animate-pulse' />
            ))}
          </div>
        )}

        {!isLoading && referralCodes.length === 0 && (
          <div className='rounded-lg border border-dashed border-gray-200 p-6 text-center'>
            <p className='text-sm text-gray-600'>No referral codes yet. Contact your account manager to receive your referral codes.</p>
          </div>
        )}

        {!isLoading && referralCodes.length > 0 && (
          <div className='space-y-3'>
            {referralCodes.map((rc) => {
              const link = buildLink(rc);
              const isCopied = copied === link;
              return (
                <div key={rc.code} className='flex items-center gap-3 p-4 rounded-lg border border-gray-100 bg-gray-50'>
                  <div className='flex-1 min-w-0'>
                    <div className='flex items-center gap-2 mb-0.5'>
                      {rc.brandName && (
                        <span className='inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-primary/10 text-primary uppercase tracking-wide'>
                          {rc.brandName}
                        </span>
                      )}
                      <p className='text-xs font-semibold text-gray-600'>
                        Code: <span className='font-mono text-primary'>{rc.code}</span>
                      </p>
                    </div>
                    <p className='text-xs text-gray-600 truncate font-mono'>{link}</p>
                  </div>
                  <button
                    onClick={() => copy(link)}
                    className={`shrink-0 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      isCopied
                        ? 'bg-green-100 text-green-700'
                        : 'bg-primary text-white hover:bg-primary-dark'
                    }`}
                  >
                    {isCopied ? 'Copied!' : 'Copy Link'}
                  </button>
                  <button
                    onClick={() => copy(rc.code)}
                    className='shrink-0 px-3 py-1.5 rounded-md text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-100 transition-colors'
                  >
                    Copy Code
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Creatives published by the operator */}
      <CreativesSection />

      {/* How it works */}
      <div className='bg-white/80 backdrop-blur-sm rounded-xl border border-violet-100 p-6'>
        <h2 className='text-sm font-semibold text-gray-800 mb-4'>How It Works</h2>
        <div className='grid grid-cols-1 sm:grid-cols-3 gap-4'>
          {[
            { step: '1', title: 'Share your link', desc: 'Send your unique referral link to potential players via your website, social media, or email.' },
            { step: '2', title: 'Player registers', desc: 'When a player clicks your link and registers, they are automatically linked to your affiliate account.' },
            { step: '3', title: 'Earn commission', desc: 'You earn commission based on the activity of the players you refer, according to your commission plan.' },
          ].map(({ step, title, desc }) => (
            <div key={step} className='flex gap-4'>
              <div className='shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold'>
                {step}
              </div>
              <div>
                <p className='text-sm font-semibold text-gray-800 mb-1'>{title}</p>
                <p className='text-xs text-gray-700 leading-relaxed'>{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Link Builder */}
      <div className='bg-white/80 backdrop-blur-sm rounded-xl border border-violet-100 p-6'>
        <h2 className='text-sm font-semibold text-gray-800 mb-1'>Link Builder</h2>
        <p className='text-xs text-gray-700 mb-4'>
          Customize your referral link with <span className='font-mono'>campaign</span>,{' '}
          <span className='font-mono'>sub</span> or any extra parameter you want to track.
          Custom keys are echoed in campaign reports.
        </p>

        {referralCodes.length === 0 && (
          <p className='text-xs text-gray-600'>
            Generate a referral code first to build a tracking link.
          </p>
        )}

        {referralCodes.length > 0 && (
          <div className='space-y-4'>
            {pagesForBrand.length > 0 && (
              <label className='flex flex-col gap-1'>
                <span className='text-xs text-gray-600'>Target page</span>
                <select
                  value={pagesForBrand.some((p) => p._id === builderPageId) ? builderPageId : ''}
                  onChange={(e) => setBuilderPageId(e.target.value)}
                  className='bg-white text-gray-700 text-xs rounded-lg px-2 py-1.5 border border-gray-200 focus:outline-none focus:border-primary shadow-sm'
                >
                  <option value=''>Homepage</option>
                  {pagesForBrand.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.name}
                      {p.url ? '' : ' (no URL — uses homepage)'}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className='grid grid-cols-1 sm:grid-cols-3 gap-3'>
              <label className='flex flex-col gap-1'>
                <span className='text-xs text-gray-600'>Base code</span>
                <select
                  value={builderCode || referralCodes[0].code}
                  onChange={(e) => setBuilderCode(e.target.value)}
                  className='bg-white text-gray-700 text-xs rounded-lg px-2 py-1.5 border border-gray-200 focus:outline-none focus:border-primary shadow-sm'
                >
                  {referralCodes.map((rc) => (
                    <option key={rc.code} value={rc.code}>
                      {rc.code}
                      {rc.brandName ? ` — ${rc.brandName}` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className='flex flex-col gap-1'>
                <span className='text-xs text-gray-600'>Campaign</span>
                <input
                  type='text'
                  value={campaign}
                  onChange={(e) => setCampaign(e.target.value)}
                  placeholder='summer_promo'
                  className='bg-white text-gray-700 text-xs rounded-lg px-2 py-1.5 border border-gray-200 focus:outline-none focus:border-primary shadow-sm'
                />
              </label>
              <label className='flex flex-col gap-1'>
                <span className='text-xs text-gray-600'>Sub</span>
                <input
                  type='text'
                  value={sub}
                  onChange={(e) => setSub(e.target.value)}
                  placeholder='banner_1'
                  className='bg-white text-gray-700 text-xs rounded-lg px-2 py-1.5 border border-gray-200 focus:outline-none focus:border-primary shadow-sm'
                />
              </label>
            </div>

            {/* Custom params */}
            <div>
              <div className='flex items-center justify-between mb-2'>
                <span className='text-xs font-semibold text-gray-700'>Custom parameters</span>
                <button
                  type='button'
                  onClick={() => setCustomParams((rows) => [...rows, { key: '', value: '' }])}
                  className='text-xs font-medium text-primary hover:text-primary-dark'
                >
                  + Add parameter
                </button>
              </div>
              {customParams.length === 0 && (
                <p className='text-xs text-gray-600'>None — add any key/value pair to track.</p>
              )}
              {customParams.map((row, i) => (
                <div key={i} className='flex items-center gap-2 mb-2'>
                  <input
                    type='text'
                    value={row.key}
                    onChange={(e) => setCustomParams((rows) =>
                      rows.map((r, idx) => (idx === i ? { ...r, key: e.target.value } : r)),
                    )}
                    placeholder='key (e.g. utm_source)'
                    className='flex-1 bg-white text-gray-700 text-xs rounded-lg px-2 py-1.5 border border-gray-200 focus:outline-none focus:border-primary shadow-sm'
                  />
                  <input
                    type='text'
                    value={row.value}
                    onChange={(e) => setCustomParams((rows) =>
                      rows.map((r, idx) => (idx === i ? { ...r, value: e.target.value } : r)),
                    )}
                    placeholder='value'
                    className='flex-1 bg-white text-gray-700 text-xs rounded-lg px-2 py-1.5 border border-gray-200 focus:outline-none focus:border-primary shadow-sm'
                  />
                  <button
                    type='button'
                    onClick={() => setCustomParams((rows) => rows.filter((_, idx) => idx !== i))}
                    className='shrink-0 px-2 py-1.5 rounded-md text-xs text-gray-600 hover:bg-gray-100'
                    aria-label='Remove parameter'
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            {/* Preview + copy */}
            <div className='border-t border-gray-100 pt-4'>
              <div className='flex items-center justify-between mb-2'>
                <span className='text-xs font-semibold text-gray-700'>Generated link</span>
                <div className='flex items-center gap-2'>
                  <button
                    type='button'
                    onClick={saveLink}
                    disabled={saving}
                    className='shrink-0 px-3 py-1.5 rounded-md text-xs font-medium border border-primary text-primary hover:bg-primary/5 disabled:opacity-60'
                  >
                    {saving ? 'Saving…' : 'Save link'}
                  </button>
                  <button
                    type='button'
                    onClick={copyBuilder}
                    className={`shrink-0 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      builderCopied
                        ? 'bg-green-100 text-green-700'
                        : 'bg-primary text-white hover:bg-primary-dark'
                    }`}
                  >
                    {builderCopied ? 'Copied!' : 'Copy Link'}
                  </button>
                </div>
              </div>
              {saveError && <p className='text-xs text-red-600 mb-2'>{saveError}</p>}
              <p className='text-xs text-gray-700 break-all font-mono bg-gray-50 rounded-md border border-gray-100 p-3'>
                {builderLink}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Saved Links */}
      <div className='bg-white/80 backdrop-blur-sm rounded-xl border border-violet-100 p-6'>
        <h2 className='text-sm font-semibold text-gray-800 mb-1'>Your Saved Links</h2>
        <p className='text-xs text-gray-700 mb-4'>
          Links you built and saved. Copy them any time, or remove the ones you no longer use.
        </p>

        {savedLinks.length === 0 ? (
          <div className='rounded-lg border border-dashed border-gray-200 p-6 text-center'>
            <p className='text-sm text-gray-600'>
              No saved links yet. Build a link above and hit &ldquo;Save link&rdquo;.
            </p>
          </div>
        ) : (
          <div className='space-y-3'>
            {savedLinks.map((l) => {
              const shareUrl = l.trackingUrl || l.url;
              const isCopied = copied === shareUrl;
              return (
                <div key={l._id} className='flex items-center gap-3 p-4 rounded-lg border border-gray-100 bg-gray-50'>
                  <div className='flex-1 min-w-0'>
                    <div className='flex items-center gap-2 mb-0.5 flex-wrap'>
                      {l.brandName && (
                        <span className='inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-primary/10 text-primary uppercase tracking-wide'>
                          {l.brandName}
                        </span>
                      )}
                      {l.label && (
                        <span className='text-xs font-semibold text-gray-700'>{l.label}</span>
                      )}
                      {l.campaign && (
                        <span className='text-[10px] text-gray-500'>campaign: {l.campaign}</span>
                      )}
                      {l.sub && (
                        <span className='text-[10px] text-gray-500'>sub: {l.sub}</span>
                      )}
                    </div>
                    <p className='text-xs text-gray-600 truncate font-mono'>{shareUrl}</p>
                  </div>
                  <button
                    onClick={() => copy(shareUrl)}
                    className={`shrink-0 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      isCopied
                        ? 'bg-green-100 text-green-700'
                        : 'bg-primary text-white hover:bg-primary-dark'
                    }`}
                  >
                    {isCopied ? 'Copied!' : 'Copy Link'}
                  </button>
                  <button
                    onClick={() => deleteSavedLink(l._id)}
                    className='shrink-0 px-3 py-1.5 rounded-md text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-100 transition-colors'
                  >
                    Delete
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Creatives published by the operator ──────────────────────────────────────

interface PortalCreative {
  _id: string;
  name: string;
  type: 'banner' | 'text';
  imageUrl: string | null;
  width: number | null;
  height: number | null;
  body: string | null;
  brandName: string | null;
  code: string;
  campaign: string;
  landing: string;
}

function CreativesSection() {
  const { data, isLoading } = useBaseQuery<{ creatives: PortalCreative[] }>({
    endpoint: AFFILIATE_PORTAL_API_URLS.CREATIVES(),
    queryKey: ['affiliate-creatives'],
  });
  const creatives = data?.creatives ?? [];
  const [copied, setCopied] = useState<string | null>(null);

  if (!isLoading && creatives.length === 0) return null;

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const linkFor = (c: PortalCreative) => {
    const sp = new URLSearchParams();
    if (c.campaign) sp.set('campaign', c.campaign);
    if (c.landing) sp.set('to', c.landing);
    return `${origin}/api/r/${c.code}?${sp.toString()}`;
  };
  const embedFor = (c: PortalCreative) => {
    const link = linkFor(c);
    if (c.type === 'banner' && c.imageUrl) {
      const dim = c.width && c.height ? ` width="${c.width}" height="${c.height}"` : '';
      return `<a href="${link}" target="_blank" rel="noopener"><img src="${c.imageUrl}" alt="${c.name}"${dim} border="0" /></a>`;
    }
    return `${c.body || ''}\n${link}`;
  };
  const copy = (key: string, text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  // Download the banner image as a file. Falls back to opening it in a new tab
  // if the host blocks cross-origin fetch.
  const download = async (c: PortalCreative) => {
    if (!c.imageUrl) return;
    try {
      const res = await fetch(c.imageUrl);
      const blob = await res.blob();
      const ext = (blob.type.split('/')[1] || 'png').split('+')[0];
      const u = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = u;
      a.download = `${(c.name || 'creative').replace(/[^\w.-]+/g, '_')}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(u);
    } catch {
      window.open(c.imageUrl, '_blank', 'noopener');
    }
  };

  return (
    <div className='bg-white/80 backdrop-blur-sm rounded-xl border border-violet-100 p-6'>
      <h2 className='text-sm font-semibold text-gray-800 mb-1'>Creatives</h2>
      <p className='text-xs text-gray-600 mb-4'>
        Banners and snippets from your operator, ready to share — each link carries your tracking code,
        and performance shows up under its <code>creative-…</code> campaign.
      </p>
      {isLoading ? (
        <p className='text-sm text-gray-600'>Loading…</p>
      ) : (
        <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'>
          {creatives.map((c) => (
            <div key={c._id} className='border border-gray-100 rounded-xl overflow-hidden bg-white'>
              <div className='h-32 bg-gray-50 flex items-center justify-center overflow-hidden'>
                {c.type === 'banner' && c.imageUrl
                  ? <img src={c.imageUrl} alt={c.name} className='max-h-32 max-w-full object-contain' />
                  : <p className='text-xs text-gray-500 px-4 line-clamp-5'>{c.body || '—'}</p>}
              </div>
              <div className='p-3 space-y-2'>
                <div>
                  <p className='text-sm font-medium text-gray-800 truncate'>{c.name}</p>
                  <p className='text-xs text-gray-500'>
                    {c.brandName || '—'}{c.width && c.height ? ` · ${c.width}×${c.height}` : ''}
                  </p>
                </div>
                <div className='flex gap-2'>
                  <button onClick={() => copy(`${c._id}-link`, linkFor(c))}
                    className='flex-1 text-xs font-medium text-violet-700 bg-violet-50 hover:bg-violet-100 rounded-lg px-2 py-1.5'>
                    {copied === `${c._id}-link` ? 'Copied!' : 'Copy link'}
                  </button>
                  <button onClick={() => copy(`${c._id}-embed`, embedFor(c))}
                    className='flex-1 text-xs font-medium text-white bg-primary rounded-lg px-2 py-1.5'>
                    {copied === `${c._id}-embed` ? 'Copied!' : c.type === 'banner' ? 'Copy embed' : 'Copy snippet'}
                  </button>
                </div>
                {c.type === 'banner' && c.imageUrl && (
                  <button onClick={() => download(c)}
                    className='w-full text-xs font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 rounded-lg px-2 py-1.5'>
                    ↓ Download image
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
