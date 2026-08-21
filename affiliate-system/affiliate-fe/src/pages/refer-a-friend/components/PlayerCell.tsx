import { memo } from 'react';

/**
 * A player's casino username, or "—" when it hasn't been synced yet.
 *
 * Deliberately not a fallback to the id: the id already has its own column, so
 * repeating it here would read as though the player were named after a hash.
 * The dash says plainly "not synced", which is a different thing from "no name".
 */
function PlayerCell({ username }: { username?: string | null }) {
  if (!username) return <span className='text-gray-400'>—</span>;
  return <span className='font-medium text-gray-900'>{username}</span>;
}

export default memo(PlayerCell);
