import dayjs from 'dayjs';
import { exportToCSV } from 'utils/common/exportToCSV';

interface Wallet {
  balance: number | { $numberDecimal?: string };
  currency?: {
    symbol?: string;
  };
}

interface Player {
  id: string;
  username: string;
  email: string;
  mobileNumber?: string;
  mobileCountryCode?: string;
  country?: string;
  city?: string;
  verifyLevel: number;
  wallets?: Wallet[];
  winningTendency?: string;
  lastLogin?: string;
  createdAt?: string;
  verify1?: {
    mobileNumber?: string;
    mobileCountryCode?: string;
  };
}

interface ApiResponse {
  data: Player[];
}

export const getPlayerMobileNumber = (player: Player): string => {
  const mobileNumber = player.mobileNumber || player.verify1?.mobileNumber || '';
  const mobileCountryCode = player.mobileCountryCode || player.verify1?.mobileCountryCode || '';

  return [mobileCountryCode, mobileNumber].filter(Boolean).join(' ').trim() || '-';
};

export const downloadPlayersCSV = (data: ApiResponse) =>
  exportToCSV({
    data: data.data,
    headers: [
      'Player ID',
      'Username',
      'Email',
      'Mobile Number',
      'Country',
      'City',
      'Verification Status',
      'Balance',
      'Winnig Tendency',
      'Last Login',
      'Created',
    ],
    filename: 'players_export.csv',
    rowMapper: (player: Player): string[] => {
      const balance =
        player.wallets
          ?.map((w: Wallet) => {
            const amount =
              typeof w.balance === 'object'
                ? parseFloat(w.balance?.$numberDecimal || '0')
                : typeof w.balance === 'number'
                  ? w.balance
                  : parseFloat(String(w.balance) || '0');

            return `${amount.toFixed(2)} ${w.currency?.symbol || ''}`;
          })
          .join(' | ') || '0';

      const lastLogin = player.lastLogin ? dayjs(player.lastLogin).format('DD.MM.YYYY') : '-';
      const createdAt = player.createdAt ? dayjs(player.createdAt).format('DD.MM.YYYY HH:mm') : '-';
      return [
        player.id,
        player.username,
        player.email,
        getPlayerMobileNumber(player),
        player.country || '-',
        player.city || '-',
        player.verifyLevel === 0 ? 'No' : `Level ${player.verifyLevel}`,
        balance,
        player.winningTendency || 'Low',
        lastLogin,
        createdAt,
      ];
    },
  });
