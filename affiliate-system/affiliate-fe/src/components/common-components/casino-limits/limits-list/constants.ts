import { getCategoryTabColDefs } from './colDefs/categoryTabColDefs';
import { getAllGeneralTabColDefs, getGeneralTabColDefs } from './colDefs/generalTabColDefs';
import { getPlayerLimitsTabColDefs } from './colDefs/playerTabColdefs';
import { getProviderTabColDefs } from './colDefs/providerTabColDefs';

export const TAB_CONFIGS: Record<
  string,
  {
    label: string;
    getColDefs: (props: any) => any[];
    hasRowDrag: boolean;
    showFooter?: boolean;
    rowData?: string;
  }
> = {
  'by-all': {
    label: 'Limit for All',
    getColDefs: getGeneralTabColDefs,
    hasRowDrag: true,
  },
  'by-category': {
    label: 'By Category',
    getColDefs: getCategoryTabColDefs,
    hasRowDrag: true,
  },
  'by-provider': {
    label: 'By Provider',
    getColDefs: getProviderTabColDefs,
    hasRowDrag: true,
  },

  'player-limits': {
    label: 'Player Limits ',
    getColDefs: getPlayerLimitsTabColDefs,
    hasRowDrag: false,
    showFooter: true,
  },
};
export const TAB_CONFIGS_BY_TIME: Record<
  string,
  {
    label: string;
    getColDefs: (props: any) => any[];
    hasRowDrag: boolean;
    showFooter?: boolean;
    rowData?: string;
  }
> = {
  'by-daily': {
    label: 'Daily Limit',
    getColDefs: getGeneralTabColDefs,
    hasRowDrag: true,
  },
  timely: {
    label: 'All Limits',
    getColDefs: getAllGeneralTabColDefs,
    hasRowDrag: true,
  },
  'by-weekly': {
    label: 'Weekly Limit',
    getColDefs: getGeneralTabColDefs,
    hasRowDrag: true,
  },
  'by-monthly': {
    label: 'Monthly Limits',
    getColDefs: getGeneralTabColDefs,
    hasRowDrag: true,
  },

  // 'by-category': {
  //   label: 'By Category',
  //   getColDefs: getCategoryTabColDefs,
  //   hasRowDrag: true,
  // },
  // 'by-provider': {
  //   label: 'By Provider',
  //   getColDefs: getProviderTabColDefs,
  //   hasRowDrag: true,
  // },
  // 'by-game': {
  //   label: 'By Game',
  //   getColDefs: getGameTabColDefs,
  //   hasRowDrag: true,
  // },
};
export const PLAYER_TAB_CONFIGS: Record<
  string,
  {
    label: string;
    getColDefs: (props: any) => any[];
    hasRowDrag: boolean;
    showFooter?: boolean;
    rowData?: string;
  }
> = {
  'by-all': {
    label: 'Limit for All',
    getColDefs: getGeneralTabColDefs,
    hasRowDrag: true,
  },
  'by-category': {
    label: 'By Category',
    getColDefs: getCategoryTabColDefs,
    hasRowDrag: true,
  },
  'by-provider': {
    label: 'By Provider',
    getColDefs: getProviderTabColDefs,
    hasRowDrag: true,
  },
};

// Player Limits Mock Data
export const playerLimitsMockData = [
  {
    id: '78436383',
    isVerified: 'Yes',
    idOfLimit: '43587492',
    category: 'Live Casino',
    username: 'Orhan777',
    provider: 'Pragmatic',
    game: 'Wild Wild Riches',
    gameId: '43587492',
    amountOrPercent: '10,000',
    currency: 'EUR',
    period: 'Daily',
    blocked: 'Yes',
    isEnabled: 'Yes',
  },
  {
    id: '43587492',
    isVerified: 'Yes',
    idOfLimit: '43587492',
    category: 'Live Casino',
    username: 'Testuser',
    provider: 'Red Tiger',
    game: 'Fishtastic',
    gameId: '23492834',
    amountOrPercent: '30%',
    currency: 'INR',
    period: 'Daily',
    blocked: 'No',
    isEnabled: 'No',
  },
  {
    id: '43227492',
    isVerified: 'Yes',
    idOfLimit: '43587492',
    category: 'Live Casino',
    username: 'Mitrius',
    provider: 'Pragmatic',
    game: 'Wild Wild Riches',
    gameId: '43587492',
    amountOrPercent: '30%',
    currency: 'EUR',
    period: 'Daily',
    blocked: 'Yes',
    isEnabled: 'Yes',
  },
  {
    id: '11587492',
    isVerified: 'Yes',
    idOfLimit: '43587492',
    category: 'Live Casino',
    username: 'Camadan',
    provider: 'Red Tiger',
    game: 'Fishtastic',
    gameId: '23492834',
    amountOrPercent: '30%',
    currency: 'INR',
    period: 'Daily',
    blocked: 'No',
    isEnabled: 'Yes',
  },
  {
    id: '43584492',
    isVerified: 'Yes',
    idOfLimit: '43587492',
    category: 'Live Casino',
    username: 'Lara',
    provider: 'Pragmatic',
    game: 'Wild Wild Riches',
    gameId: '43587492',
    amountOrPercent: '10,000',
    currency: 'EUR',
    period: 'Daily',
    blocked: 'Yes',
    isEnabled: 'Yes',
  },
  {
    id: '43777492',
    isVerified: 'Yes',
    idOfLimit: '43587492',
    category: 'Live Casino',
    username: 'Soccerman',
    provider: 'Red Tiger',
    game: 'Fishtastic',
    gameId: '23492834',
    amountOrPercent: '20,000',
    currency: 'INR',
    period: 'Daily',
    blocked: 'No',
    isEnabled: 'Yes',
  },
  {
    id: '43887492',
    isVerified: 'Yes',
    idOfLimit: '43587492',
    category: 'Live Casino',
    username: 'Osimhen',
    provider: 'Pragmatic',
    game: 'Wild Wild Riches',
    gameId: '43587492',
    amountOrPercent: '10,000',
    currency: 'EUR',
    period: 'Daily',
    blocked: 'Yes',
    isEnabled: 'Yes',
  },
  {
    id: '40587492',
    isVerified: 'Yes',
    idOfLimit: '43587492',
    category: 'Live Casino',
    username: 'Athena',
    provider: 'Red Tiger',
    game: 'Fishtastic',
    gameId: '23492834',
    amountOrPercent: '20,000',
    currency: 'INR',
    period: 'Daily',
    blocked: 'No',
    isEnabled: 'Yes',
  },
  {
    id: '43580492',
    isVerified: 'Yes',
    idOfLimit: '43587492',
    category: 'Live Casino',
    username: 'Testuser',
    provider: 'Pragmatic',
    game: 'Wild Wild Riches',
    gameId: '43587492',
    amountOrPercent: '10,000',
    currency: 'EUR',
    period: 'Daily',
    blocked: 'Yes',
    isEnabled: 'Yes',
  },
  {
    id: '43587490',
    isVerified: 'Yes',
    idOfLimit: '43587492',
    category: 'Live Casino',
    username: 'Testuser',
    provider: 'Red Tiger',
    game: 'Fishtastic',
    gameId: '23492834',
    amountOrPercent: '20,000',
    currency: 'INR',
    period: 'Daily',
    blocked: 'No',
    isEnabled: 'Yes',
  },
  {
    id: '43500492',
    isVerified: 'Yes',
    idOfLimit: '43587492',
    category: 'Live Casino',
    username: 'Testuser',
    provider: 'Pragmatic',
    game: 'Wild Wild Riches',
    gameId: '43587492',
    amountOrPercent: '10,000',
    currency: 'EUR',
    period: 'Daily',
    blocked: 'Yes',
    isEnabled: 'Yes',
  },
  {
    id: '40087492',
    isVerified: 'Yes',
    idOfLimit: '43587492',
    category: 'Live Casino',
    username: 'Testuser',
    provider: 'Red Tiger',
    game: 'Fishtastic',
    gameId: '23492834',
    amountOrPercent: '20,000',
    currency: 'INR',
    period: 'Daily',
    blocked: 'No',
    isEnabled: 'Yes',
  },
];
