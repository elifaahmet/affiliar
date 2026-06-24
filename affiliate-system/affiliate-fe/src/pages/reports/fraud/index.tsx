import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useBaseQuery } from 'api/core/useBaseQuery';
import axiosInstance from 'config/axiosInstance';
import { FRAUD_API_URLS } from 'config/apiUrls';

interface FlaggedPlayer {
  playerId: string;
  affiliateId: string | null;
  affiliate: string;
  affiliateCode: string | null;
  reason: string | null;
  flaggedAt: string | null;
  country: string | null;
}
interface FraudListResponse { count: number; players: FlaggedPlayer[] }

const REASON_LABEL: Record<string, string> = {
  shared_ip: 'Shared IP',
  shared_device: 'Shared device',
  shared_wallet: 'Shared wallet',
  manual: 'Manual',
};

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

export default function FraudReport() {
  const queryClient = useQueryClient();
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);

  const { data, isLoading } = useBaseQuery<FraudListResponse>({
    endpoint: FRAUD_API_URLS.LIST(),
    queryKey: ['fraud-list'],
  });
  const players = data?.players ?? [];

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['fraud-list'] });

  const rescan = async () => {
    setScanning(true);
    setScanMsg(null);
    try {
      const res = await axiosInstance.post(FRAUD_API_URLS.SCAN(), {});
      const { clusters, flaggedPlayers } = res.data || {};
      setScanMsg(`Scan complete — ${clusters ?? 0} clusters, ${flaggedPlayers ?? 0} players flagged.`);
      refresh();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Scan failed.');
    } finally {
      setScanning(false);
    }
  };

  const dismiss = async (playerId: string) => {
    try {
      await axiosInstance.patch(FRAUD_API_URLS.FLAG(playerId), { flagged: false });
      refresh();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Could not clear flag.');
    }
  };

  return (
    <div className='h-full overflow-auto p-6 pb-24 space-y-5'>
      <div className='flex items-center justify-between gap-3 flex-wrap'>
        <div>
          <h1 className='text-xl font-semibold text-gray-800'>Fraud review</h1>
          <p className='text-xs text-gray-600 mt-1'>
            Players sharing an IP / device / wallet under one affiliate (likely self-referral).
            Flagged players&apos; FTDs are auto-rejected from CPA commission.
          </p>
        </div>
        <div className='flex items-center gap-3'>
          {scanMsg && <span className='text-xs text-gray-600'>{scanMsg}</span>}
          <button
            onClick={rescan}
            disabled={scanning}
            className='px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-white hover:bg-primary-dark disabled:opacity-50'
          >
            {scanning ? 'Scanning…' : 'Run scan'}
          </button>
        </div>
      </div>

      <div className='bg-white rounded-xl border border-gray-100 overflow-hidden'>
        {isLoading ? (
          <p className='p-6 text-sm text-gray-600'>Loading…</p>
        ) : players.length === 0 ? (
          <p className='p-6 text-sm text-gray-600'>No flagged players. Run a scan to detect shared-fingerprint clusters.</p>
        ) : (
          <table className='w-full text-sm'>
            <thead className='bg-gray-50'>
              <tr>
                <th className='px-4 py-2.5 text-left text-xs font-semibold text-gray-700'>Player</th>
                <th className='px-4 py-2.5 text-left text-xs font-semibold text-gray-700'>Affiliate</th>
                <th className='px-4 py-2.5 text-left text-xs font-semibold text-gray-700'>Reason</th>
                <th className='px-4 py-2.5 text-left text-xs font-semibold text-gray-700'>Country</th>
                <th className='px-4 py-2.5 text-left text-xs font-semibold text-gray-700'>Flagged</th>
                <th className='px-4 py-2.5 text-right text-xs font-semibold text-gray-700'>Action</th>
              </tr>
            </thead>
            <tbody className='divide-y divide-gray-100'>
              {players.map((p) => (
                <tr key={p.playerId}>
                  <td className='px-4 py-2.5 text-xs font-mono text-gray-700'>{p.playerId}</td>
                  <td className='px-4 py-2.5 text-xs text-gray-700'>
                    {p.affiliate}{p.affiliateCode && <span className='text-gray-400'> · {p.affiliateCode}</span>}
                  </td>
                  <td className='px-4 py-2.5'>
                    <span className='inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-red-50 text-red-700'>
                      {REASON_LABEL[p.reason ?? ''] ?? p.reason ?? '—'}
                    </span>
                  </td>
                  <td className='px-4 py-2.5 text-xs text-gray-700'>{p.country || '—'}</td>
                  <td className='px-4 py-2.5 text-xs text-gray-600'>{fmtDate(p.flaggedAt)}</td>
                  <td className='px-4 py-2.5 text-right'>
                    <button
                      onClick={() => dismiss(p.playerId)}
                      className='px-2.5 py-1 text-xs font-medium rounded-md bg-gray-100 text-gray-700 hover:bg-green-50 hover:text-green-700'
                      title='Clear the flag (false positive) — re-qualifies their FTDs on next calc'
                    >
                      Dismiss
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
