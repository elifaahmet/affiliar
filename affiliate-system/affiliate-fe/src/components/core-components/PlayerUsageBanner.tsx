import { useNavigate } from 'react-router-dom';
import { useBaseQuery } from 'api/core/useBaseQuery';
import { OPERATOR_API_URLS } from 'config/apiUrls';

interface PlayerUsage {
  plan: string;
  activePlayers: number;
  maxPlayers: number | null;
  over: boolean;
}

/**
 * Slim amber banner shown to an operator once this month's active players
 * exceed their plan cap. Soft nudge — data keeps flowing; it just prompts an
 * upgrade. Hidden for affiliates (endpoint is operator-scoped and 4xxs → no
 * data) and for lifetime-free tenants (maxPlayers null → never `over`).
 */
export default function PlayerUsageBanner() {
  const { data } = useBaseQuery<PlayerUsage>({
    endpoint: OPERATOR_API_URLS.PLAYER_USAGE(),
    queryKey: ['operator-player-usage'],
  });
  const navigate = useNavigate();

  if (!data || !data.over || data.maxPlayers == null) return null;

  return (
    <div className='bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center gap-3'>
      <span className='text-sm text-amber-900'>
        <b>Player limit reached.</b>{' '}
        {data.activePlayers.toLocaleString('en-US')} of{' '}
        {data.maxPlayers.toLocaleString('en-US')} monthly active players used on your plan.
        Upgrade to keep tracking every player without interruption.
      </span>
      <button
        type='button'
        onClick={() => navigate('/billing')}
        className='ml-auto inline-flex items-center rounded-md bg-amber-600 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-700'
      >
        Upgrade →
      </button>
    </div>
  );
}
