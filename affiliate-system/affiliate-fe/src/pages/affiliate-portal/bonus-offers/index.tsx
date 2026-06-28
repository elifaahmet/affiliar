import { useState } from 'react';
import { useBaseQuery } from 'api/core/useBaseQuery';
import { AFFILIATE_PORTAL_API_URLS } from 'config/apiUrls';

interface Offer {
  offerId: string;
  name: string;
  description: string | null;
  type: 'deposit_bonus' | 'free_spins' | 'cashback';
  brandName: string | null;
  wageringMultiplier: number;
  validityDays: number;
  percentAmount: number | null;
  minDepositAmount: number | null;
  maxBonusAmount: number | null;
  freeSpinCount: number | null;
  cashbackPercent: number | null;
  currency: string;
  code: string;
  link: string | null;
  claims: number;
  ready: boolean;
}

const TYPE_LABEL: Record<string, string> = { deposit_bonus: 'Deposit match', free_spins: 'Free spins', cashback: 'Cashback' };
function terms(o: Offer): string {
  if (o.type === 'deposit_bonus') return `${o.percentAmount ?? 0}% up to ${o.maxBonusAmount ?? '—'} ${o.currency}, min dep ${o.minDepositAmount ?? 0}`;
  if (o.type === 'free_spins') return `${o.freeSpinCount ?? 0} free spins`;
  return `${o.cashbackPercent ?? 0}% cashback`;
}

export default function AffiliateBonusOffers() {
  const { data, isLoading } = useBaseQuery<{ offers: Offer[] }>({
    endpoint: AFFILIATE_PORTAL_API_URLS.BONUS_OFFERS(), queryKey: ['affiliate-bonus-offers'],
  });
  const offers = data?.offers ?? [];
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (key: string, text: string) => navigator.clipboard.writeText(text).then(() => { setCopied(key); setTimeout(() => setCopied(null), 2000); });

  return (
    <div className='h-full overflow-auto p-6 pb-24 space-y-6'>
      <div>
        <h1 className='text-xl font-semibold text-gray-800'>Bonuses to share</h1>
        <p className='text-xs text-gray-600 mt-1'>Give these bonuses to your players — share the code or the link. Conversions are tracked to you.</p>
      </div>

      {isLoading ? <p className='text-sm text-gray-600'>Loading…</p>
        : offers.length === 0 ? <p className='text-sm text-gray-600 bg-white/80 rounded-xl border border-violet-100 p-6'>No bonuses available to share yet. Your operator will publish some.</p>
        : <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
            {offers.map((o) => (
              <div key={o.offerId} className='bg-white/80 backdrop-blur-sm rounded-xl border border-violet-100 p-5 space-y-3'>
                <div className='flex items-start justify-between gap-2'>
                  <div>
                    <p className='text-sm font-semibold text-gray-800'>{o.name}</p>
                    <p className='text-xs text-gray-500 mt-0.5'>{TYPE_LABEL[o.type]}{o.brandName ? ` · ${o.brandName}` : ''}</p>
                  </div>
                  {!o.ready && <span className='text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700' title='Not live in the casino yet'>pending</span>}
                </div>
                <p className='text-xs text-gray-600'>{terms(o)} · {o.wageringMultiplier}× wagering · valid {o.validityDays}d</p>

                <div className='flex items-center gap-2 bg-violet-50 rounded-lg px-3 py-2'>
                  <span className='text-[11px] text-gray-500'>Code</span>
                  <code className='flex-1 text-sm font-semibold text-violet-700'>{o.code}</code>
                  <button onClick={() => copy(`${o.offerId}-code`, o.code)} className='text-xs font-medium text-violet-700 hover:underline'>{copied === `${o.offerId}-code` ? 'Copied!' : 'Copy'}</button>
                </div>

                {o.link && (
                  <button onClick={() => copy(`${o.offerId}-link`, o.link!)} className='w-full text-xs font-medium text-white bg-primary rounded-lg px-3 py-2'>
                    {copied === `${o.offerId}-link` ? 'Link copied!' : 'Copy share link'}
                  </button>
                )}
              </div>
            ))}
          </div>}
    </div>
  );
}
