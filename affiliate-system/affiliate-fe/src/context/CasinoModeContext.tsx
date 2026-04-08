import React, { createContext, ReactNode, useContext, useState } from 'react';

export type CasinoMode = 'casino' | 'live' | 'both';

type CasinoModeContextType = {
  mode: CasinoMode;
  setMode: (val: CasinoMode) => void;
};

const CasinoModeContext = createContext<CasinoModeContextType | undefined>(undefined);

export const CasinoModeProvider = ({ children }: { children: ReactNode }) => {
  const [mode, setMode] = useState<CasinoMode>('casino');

  return (
    <CasinoModeContext.Provider value={{ mode, setMode }}>{children}</CasinoModeContext.Provider>
  );
};

export const useCasinoMode = () => {
  const context = useContext(CasinoModeContext);
  if (!context) throw new Error('useCasinoMode must be used within CasinoModeProvider');
  return context;
};
