import { useState, useMemo } from 'react';
import { useBaseQuery } from 'api/core/useBaseQuery';
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

  const { data, isLoading } = useBaseQuery<OverviewResponse>({
    endpoint: AFFILIATE_PORTAL_API_URLS.OVERVIEW(),
    queryKey: ['affiliate-overview-marketing'],
    params: {},
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

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(text);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const fallbackBaseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  function buildLink(rc: BrandReferralCode) {
    const base = (rc.brandUrl || fallbackBaseUrl).replace(/\/+$/, '');
    return `${base}/?ref=${rc.code}`;
  }

  return (
    <div className='bg-gray-100 h-full overflow-auto p-6 pb-24 space-y-6'>

      {/* Campaign Performance */}
      <div className='bg-white rounded-xl shadow-sm border border-gray-100 p-6'>
        <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4'>
          <div>
            <h2 className='text-sm font-semibold text-gray-800 mb-1'>Campaign Performance</h2>
            <p className='text-xs text-gray-400'>Metrics for your tracked campaigns (UTM-style identifiers).</p>
          </div>
          <div className='flex items-center gap-2'>
            <input
              type='date'
              value={dateRange.from}
              onChange={(e) => setDateRange((r) => ({ ...r, from: e.target.value }))}
              className='bg-white text-gray-700 text-xs rounded-lg px-2 py-1.5 border border-gray-200 focus:outline-none focus:border-primary shadow-sm'
            />
            <span className='text-gray-400 text-xs'>&rarr;</span>
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
            <p className='text-sm text-gray-400'>No campaign data for this period. Use the &ldquo;campaign&rdquo; query parameter in your referral links to start tracking.</p>
          </div>
        )}

        {!campaignLoading && campaignRows.length > 0 && (
          <div className='overflow-x-auto'>
            <table className='w-full'>
              <thead className='bg-gray-50'>
                <tr>
                  <th className='px-4 py-2 text-left text-xs font-semibold text-gray-500'>Campaign</th>
                  <th className='px-4 py-2 text-right text-xs font-semibold text-gray-500'>Regs</th>
                  <th className='px-4 py-2 text-right text-xs font-semibold text-gray-500'>FTDs</th>
                  <th className='px-4 py-2 text-right text-xs font-semibold text-gray-500'>Deposits (&euro;)</th>
                  <th className='px-4 py-2 text-right text-xs font-semibold text-gray-500'>NGR (&euro;)</th>
                  <th className='px-4 py-2 text-right text-xs font-semibold text-gray-500'>Players</th>
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
      <div className='bg-white rounded-xl shadow-sm border border-gray-100 p-6'>
        <h2 className='text-sm font-semibold text-gray-800 mb-1'>Your Referral Links</h2>
        <p className='text-xs text-gray-400 mb-4'>Share these links to refer new players. Each player registered through your link will be tracked to your account.</p>

        {isLoading && (
          <div className='space-y-3'>
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className='h-14 bg-gray-100 rounded-lg animate-pulse' />
            ))}
          </div>
        )}

        {!isLoading && referralCodes.length === 0 && (
          <div className='rounded-lg border border-dashed border-gray-200 p-6 text-center'>
            <p className='text-sm text-gray-400'>No referral codes yet. Contact your account manager to receive your referral codes.</p>
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
                    <p className='text-xs text-gray-400 truncate font-mono'>{link}</p>
                  </div>
                  <button
                    onClick={() => copy(link)}
                    className={`shrink-0 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      isCopied
                        ? 'bg-green-100 text-green-700'
                        : 'bg-primary text-white hover:bg-blue-600'
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
      <div className='bg-white rounded-xl shadow-sm border border-gray-100 p-6'>
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
                <p className='text-xs text-gray-500 leading-relaxed'>{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tracking parameters */}
      <div className='bg-white rounded-xl shadow-sm border border-gray-100 p-6'>
        <h2 className='text-sm font-semibold text-gray-800 mb-2'>Advanced Tracking</h2>
        <p className='text-xs text-gray-500 mb-4'>
          Add optional query parameters to your referral link for campaign tracking.
        </p>
        <div className='overflow-x-auto'>
          <table className='w-full text-xs'>
            <thead>
              <tr className='bg-gray-50'>
                <th className='px-4 py-2 text-left font-semibold text-gray-500'>Parameter</th>
                <th className='px-4 py-2 text-left font-semibold text-gray-500'>Example</th>
                <th className='px-4 py-2 text-left font-semibold text-gray-500'>Description</th>
              </tr>
            </thead>
            <tbody className='divide-y divide-gray-100'>
              <tr>
                <td className='px-4 py-2 font-mono text-primary'>ref</td>
                <td className='px-4 py-2 font-mono text-gray-600'>ABC123</td>
                <td className='px-4 py-2 text-gray-500'>Your referral code (required)</td>
              </tr>
              <tr>
                <td className='px-4 py-2 font-mono text-primary'>campaign</td>
                <td className='px-4 py-2 font-mono text-gray-600'>summer_promo</td>
                <td className='px-4 py-2 text-gray-500'>Campaign identifier</td>
              </tr>
              <tr>
                <td className='px-4 py-2 font-mono text-primary'>sub</td>
                <td className='px-4 py-2 font-mono text-gray-600'>banner_1</td>
                <td className='px-4 py-2 text-gray-500'>Sub-source / placement</td>
              </tr>
            </tbody>
          </table>
        </div>
        {referralCodes.length > 0 && (
          <p className='text-xs text-gray-400 mt-3'>
            Example: <span className='font-mono text-primary'>{buildLink(referralCodes[0])}&campaign=summer_promo&sub=banner_1</span>
          </p>
        )}
      </div>
    </div>
  );
}
