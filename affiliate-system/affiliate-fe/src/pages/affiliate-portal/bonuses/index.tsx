import { useBaseQuery } from 'api/core/useBaseQuery';
import { AFFILIATE_PORTAL_API_URLS } from 'config/apiUrls';

interface Campaign {
  _id: string;
  name: string;
  description: string | null;
  metricLabel: string;
  metricIsMoney: boolean;
  target: number;
  rewardCents: number;
  endDate: string;
  brandId: { name: string } | null;
  value: number;
  achieved: boolean;
}
interface Award {
  _id: string;
  rewardCents: number;
  status: 'pending' | 'paid';
  achievedAt: string;
  campaignId: { name: string } | null;
}

const eur = (c: number) => `€${(Number(c || 0) / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
const fmtVal = (v: number, money: boolean) => (money ? eur(v) : String(v));
const day = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });

export default function AffiliateBonuses() {
  const { data, isLoading } = useBaseQuery<{ campaigns: Campaign[]; awards: Award[] }>({
    endpoint: AFFILIATE_PORTAL_API_URLS.BONUSES(),
    queryKey: ['affiliate-bonuses'],
  });
  const campaigns = data?.campaigns ?? [];
  const awards = data?.awards ?? [];

  return (
    <div className='h-full overflow-auto p-6 pb-24 space-y-6'>
      <div>
        <h1 className='text-xl font-semibold text-gray-800'>Bonus campaigns</h1>
        <p className='text-xs text-gray-600 mt-1'>Hit a target before it ends and the bonus is yours — tracked live.</p>
      </div>

      {isLoading ? (
        <p className='text-sm text-gray-600'>Loading…</p>
      ) : campaigns.length === 0 ? (
        <p className='text-sm text-gray-600 bg-white/80 rounded-xl border border-violet-100 p-6'>
          No active bonus campaigns right now. Check back soon!
        </p>
      ) : (
        <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
          {campaigns.map((c) => {
            const pct = Math.min(100, Math.round((c.value / c.target) * 100) || 0);
            return (
              <div key={c._id} className='bg-white/80 backdrop-blur-sm rounded-xl border border-violet-100 p-5'>
                <div className='flex items-start justify-between gap-2'>
                  <div>
                    <p className='text-sm font-semibold text-gray-800'>{c.name}</p>
                    <p className='text-xs text-gray-500 mt-0.5'>
                      {fmtVal(c.target, c.metricIsMoney)} {c.metricLabel}{c.brandId ? ` · ${c.brandId.name}` : ''} · ends {day(c.endDate)}
                    </p>
                  </div>
                  <span className='text-sm font-bold text-fuchsia-600 whitespace-nowrap'>{eur(c.rewardCents)}</span>
                </div>

                <div className='mt-3'>
                  <div className='h-2.5 rounded-full bg-gray-100 overflow-hidden'>
                    <div className={`h-full rounded-full ${c.achieved ? 'bg-green-500' : 'bg-gradient-to-r from-violet-500 to-fuchsia-500'}`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className='flex items-center justify-between mt-1.5'>
                    <span className='text-xs text-gray-600'>{fmtVal(c.value, c.metricIsMoney)} / {fmtVal(c.target, c.metricIsMoney)}</span>
                    {c.achieved
                      ? <span className='text-xs font-semibold text-green-600'>🎉 Earned!</span>
                      : <span className='text-xs text-gray-500'>{pct}%</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {awards.length > 0 && (
        <div className='bg-white/80 backdrop-blur-sm rounded-xl border border-violet-100 p-5'>
          <h2 className='text-sm font-semibold text-gray-800 mb-3'>Your awards</h2>
          <div className='divide-y divide-gray-50'>
            {awards.map((a) => (
              <div key={a._id} className='flex items-center gap-2 py-2'>
                <span className='flex-1 text-sm text-gray-800 truncate'>{a.campaignId?.name || 'Bonus'}</span>
                <span className='text-xs text-gray-500'>{day(a.achievedAt)}</span>
                <span className='text-sm font-semibold text-gray-900'>{eur(a.rewardCents)}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${a.status === 'paid' ? 'bg-green-50 text-green-600' : 'bg-yellow-50 text-yellow-700'}`}>{a.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
