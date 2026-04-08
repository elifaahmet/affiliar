import React from 'react';

import FinancialOverview from './FinancialOverview';
import PlayerInfo from './PlayerInfo';

export const PlayerProfile: React.FC = () => {
  return (
    <main className="flex flex-col rounded-3xl">
      <div className="flex flex-col w-full max-md:max-w-full">
        <div className="flex flex-col md:flex-row h-[140px] justify-between items-start gap-1 w-full max-md:max-w-full">
          <PlayerInfo />
          <FinancialOverview />
        </div>
      </div>
    </main>
  );
};

export default PlayerProfile;
