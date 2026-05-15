import { useState, useMemo } from 'react';
import { useBaseQuery } from 'api/core/useBaseQuery';
import { useBaseMutation } from 'api/core/useBaseMutation';
import { useQueryClient } from '@tanstack/react-query';
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
  const queryClient = useQueryClient();

  const { data, isLoading } = useBaseQuery<OverviewResponse>({
    endpoint: AFFILIATE_PORTAL_API_URLS.OVERVIEW(),
    queryKey: ['affiliate-overview-marketing'],
    params: {},
  });

  const generateMutation = useBaseMutation<{ generated: { code: string } }, { brandId: string }>({
    endpoint: AFFILIATE_PORTAL_API_URLS.REFERRAL_CODES(),
    method: 'post',
    onSuccess: (res) => {
      setGeneratedCode(res?.generated?.code ?? null);
      setGenerateError(null);
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

  // Link builder state — selected base code + tracking params.
  const [builderCode, setBuilderCode] = useState<string>('');
  const [campaign, setCampaign] = useState<string>('');
  const [sub, setSub] = useState<string>('');
  const [customParams, setCustomParams] = useState<Array<{ key: string; value: string }>>([]);
  const [builderCopied, setBuilderCopied] = useState(false);

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

  // Live preview of the builder link. Returns the full URL with the
  // selected code + any campaign / sub / custom params appended.
  const builderLink = useMemo(() => {
    const rc =
      referralCodes.find((r) => r.code === builderCode) ?? referralCodes[0];
    if (!rc) return '';
    const params: Array<[string, string]> = [];
    if (campaign.trim()) params.push(['campaign', campaign.trim()]);
    if (sub.trim()) params.push(['sub', sub.trim()]);
    for (const p of customParams) {
      const k = p.key.trim();
      const v = p.value.trim();
      if (k && v && k.toLowerCase() !== 'affiliate') {
        params.push([k, v]);
      }
    }
    const base = buildLink(rc); // already has ?affiliate=<code>
    if (params.length === 0) return base;
    const tail = params
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    return `${base}&${tail}`;
  }, [referralCodes, builderCode, campaign, sub, customParams]);

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
              <button
                type='button'
                disabled={generateMutation.isPending}
                onClick={() => {
                  const brandId = selectedBrandId || availableBrands[0]?.id;
                  if (!brandId) return;
                  generateMutation.mutate({ brandId });
                }}
                className='shrink-0 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-white hover:bg-primary-dark disabled:opacity-60 disabled:cursor-not-allowed'
              >
                {generateMutation.isPending ? 'Generating…' : 'Generate new code'}
              </button>
            </div>
          )}
        </div>

        {generatedCode && (
          <p className='text-xs text-green-700 mb-3'>
            New code generated: <span className='font-mono'>{generatedCode}</span>
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
              <p className='text-xs text-gray-700 break-all font-mono bg-gray-50 rounded-md border border-gray-100 p-3'>
                {builderLink}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
