import { useEffect, useState } from 'react';
import { useBaseQuery } from 'api/core/useBaseQuery';
import { AFFILIATE_PORTAL_API_URLS } from 'config/apiUrls';
import axiosInstance from 'config/axiosInstance';

interface PayoutInfo {
  payoutAddress: string | null;
  payoutNetwork: string;
  payoutCurrency: string;
  payoutAddressSetAt: string | null;
  // Which assets each network can actually be paid in, straight from the
  // backend's payoutNetworks table. Rendering from this means the form can
  // never offer a pair the payout dispatcher would later reject.
  options: Record<string, string[]>;
  networkLabels: Record<string, string>;
}

// Address shapes, mirroring utils/payoutNetworks.js on the backend. Checked
// here only to catch the mistake before it costs a round-trip — the backend
// re-validates, and the chain itself is the real authority.
const TRON_ADDRESS_RE = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;
const EVM_ADDRESS_RE  = /^0x[a-fA-F0-9]{40}$/;

function addressValid(network: string, address: string) {
  if (network === 'TRC20') return TRON_ADDRESS_RE.test(address);
  return EVM_ADDRESS_RE.test(address);
}

function addressHint(network: string) {
  return network === 'TRC20'
    ? 'must be 34 characters starting with T'
    : 'must be 42 characters starting with 0x';
}

function addressPlaceholder(network: string) {
  return network === 'TRC20'
    ? 'TXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'
    : '0xXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
}

/**
 * Self-service payout wallet: address + which chain and stablecoin to send it
 * on. Reads and writes /affiliate-portal/payout-info, which owns the list of
 * valid (network, asset) pairs — this component never hard-codes one.
 */
export default function PayoutWallet() {
  const { data, refetch } = useBaseQuery<PayoutInfo>({
    endpoint: AFFILIATE_PORTAL_API_URLS.PAYOUT_INFO(),
    queryKey: ['affiliate-payout-info'],
  });

  const [address, setAddress]   = useState('');
  const [network, setNetwork]   = useState('TRC20');
  const [currency, setCurrency] = useState('USDT');
  const [saving, setSaving]     = useState(false);
  const [msg, setMsg]           = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setAddress(data.payoutAddress ?? '');
    setNetwork(data.payoutNetwork);
    setCurrency(data.payoutCurrency);
  }, [data]);

  const pairs      = data?.options ?? {};
  const networks   = Object.keys(pairs);
  const currencies = pairs[network] ?? [];

  // Switching to a chain that doesn't carry the selected asset (USDC has no
  // TRC20 contract) would leave the form holding an unpayable pair, so the
  // asset falls back to the first one that chain does support.
  const chooseNetwork = (next: string) => {
    setNetwork(next);
    const allowed = pairs[next] ?? [];
    if (!allowed.includes(currency)) setCurrency(allowed[0] ?? '');
    // An EVM address is meaningless on Tron and vice versa — clear rather than
    // let a stale address be submitted against the new chain.
    if (address && !addressValid(next, address.trim())) setAddress('');
  };

  const trimmed = address.trim();
  const dirty =
    trimmed !== (data?.payoutAddress ?? '') ||
    network !== data?.payoutNetwork ||
    currency !== data?.payoutCurrency;

  const handleSave = async () => {
    if (!addressValid(network, trimmed)) {
      setMsg(`Invalid ${network} address — ${addressHint(network)}.`);
      setTimeout(() => setMsg(null), 4000);
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      await axiosInstance.put(AFFILIATE_PORTAL_API_URLS.PAYOUT_INFO(), {
        payoutAddress:  trimmed,
        payoutNetwork:  network,
        payoutCurrency: currency,
      });
      setMsg('Wallet saved.');
      refetch();
    } catch (err: any) {
      setMsg(err?.response?.data?.error || 'Failed to save wallet.');
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(null), 3000);
    }
  };

  return (
    <div className='bg-white/80 backdrop-blur-sm rounded-xl border border-violet-100 p-6 max-w-2xl'>
      <div className='flex items-start justify-between mb-4'>
        <div>
          <h2 className='text-sm font-semibold text-gray-800'>Payout Wallet</h2>
          <p className='text-xs text-gray-600 mt-0.5'>
            Where your operator sends commissions. Pick the network and stablecoin you want to be paid in.
          </p>
        </div>
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
          data?.payoutAddress
            ? 'bg-green-50 text-green-700 border border-green-100'
            : 'bg-amber-50 text-amber-700 border border-amber-100'
        }`}>
          {data?.payoutAddress ? 'Wallet set' : 'No wallet yet'}
        </span>
      </div>

      <div className='space-y-3'>
        <div className='flex gap-3'>
          <div className='flex-1'>
            <label className='block text-xs font-medium text-gray-600 mb-1'>Network</label>
            <select
              value={network}
              onChange={(e) => chooseNetwork(e.target.value)}
              className='w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:border-primary'
            >
              {networks.map((n) => (
                <option key={n} value={n}>{data?.networkLabels?.[n] ?? n}</option>
              ))}
            </select>
          </div>
          <div className='w-40'>
            <label className='block text-xs font-medium text-gray-600 mb-1'>Asset</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className='w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:border-primary'
            >
              {currencies.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className='block text-xs font-medium text-gray-600 mb-1'>
            {currency}-{network} address
          </label>
          <input
            type='text'
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className='w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono text-gray-700 focus:outline-none focus:border-primary'
            placeholder={addressPlaceholder(network)}
            autoComplete='off'
            spellCheck={false}
          />
          <p className='text-[11px] text-gray-500 mt-1'>
            Double-check the address and the network — payouts sent to the wrong chain can&apos;t be recovered.
          </p>
        </div>

        {data?.payoutAddressSetAt && (
          <p className='text-[11px] text-gray-500'>
            Last updated:{' '}
            {new Date(data.payoutAddressSetAt).toLocaleDateString(undefined, {
              year: 'numeric', month: 'short', day: '2-digit',
            })}
          </p>
        )}

        <div className='flex items-center gap-3 pt-1'>
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            className='px-5 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors'
          >
            {saving ? 'Saving...' : data?.payoutAddress ? 'Update wallet' : 'Save wallet'}
          </button>
          {msg && (
            <p className={`text-xs ${msg.toLowerCase().includes('saved') ? 'text-green-600' : 'text-red-500'}`}>
              {msg}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
