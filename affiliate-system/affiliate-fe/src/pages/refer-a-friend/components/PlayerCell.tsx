import { memo } from 'react';

/**
 * A player in a table: the casino username when we have it cached, the raw id
 * when we don't. The id is always kept — it is what support, exports and the
 * casino itself identify the player by, and it is the only thing that survives
 * a rename.
 */
function PlayerCell({ id, username }: { id: string; username?: string | null }) {
  if (!username) {
    return <span className='font-mono text-[11px] text-gray-700'>{id}</span>;
  }
  return (
    <span className='inline-flex flex-col leading-tight'>
      <span className='font-medium text-gray-900'>{username}</span>
      <span className='font-mono text-[10px] text-gray-500'>{id}</span>
    </span>
  );
}

export default memo(PlayerCell);
