import dayjs from 'dayjs';
import { exportToCSV } from 'utils/common/exportToCSV';

interface CasinoStatsCategoryItem {
  _id: string;
  category?: { name?: string };
  amount?: number;
  currency?: string;
  percent?: number;
  isVerified?: boolean;
  note?: string;
  changedBy?: { email?: string };
  createdAt?: string;
  updatedAt?: string;
  isEnabled?: boolean;
}

export const downloadCasinoStatsByCategoryCSV = (data: CasinoStatsCategoryItem[]) => {
  return exportToCSV({
    data,
    headers: [
      'ID of Limit',
      'Category',
      'Amount',
      'Currency',
      'Percent',
      'Is Verified',
      'Note',
      'Changed By',
      'Created',
      'Updated',
      'Enable',
    ],
    filename: 'casino_stats_by_category.csv',
    rowMapper: (row): string[] => [
      row._id || '-',
      row.category?.name || '-',
      typeof row.amount === 'number'
        ? row.amount.toLocaleString('de-DE', { minimumFractionDigits: 2 })
        : '-',
      row.currency || '-',
      typeof row.percent === 'number'
        ? row.percent.toLocaleString('de-DE', { minimumFractionDigits: 2 })
        : '-',
      row.isVerified === true ? 'Yes' : row.isVerified === false ? 'No' : '-',
      row.note || '-',
      row.changedBy?.email || '-',
      row.createdAt ? dayjs(row.createdAt).format('DD/MM/YYYY - HH:mm') : '-',
      row.updatedAt ? dayjs(row.updatedAt).format('DD/MM/YYYY - HH:mm') : '-',
      row.isEnabled === true ? 'Yes' : row.isEnabled === false ? 'No' : '-',
    ],
  });
};

interface ProviderLimit {
  _id: string;
  provider?: { name: string };
  amount?: number;
  currency?: string;
  percent?: number;
  isVerified?: boolean;
  note?: string;
  changedBy?: { email?: string };
  createdAt?: string;
  updatedAt?: string;
  isEnabled?: boolean;
}

export const downloadCasinoStatsByProviderCSV = (data: ProviderLimit[]) => {
  return exportToCSV({
    data,
    headers: [
      'ID of Limit',
      'Provider',
      'Amount',
      'Currency',
      'Percent',
      'Is Verified',
      'Note',
      'Changed By',
      'Created',
      'Updated',
      'Enable',
    ],
    filename: 'casino_stats_by_provider.csv',
    rowMapper: (row: ProviderLimit): string[] => [
      row._id || '-',
      row.provider?.name || '-',
      typeof row.amount === 'number'
        ? row.amount.toLocaleString('de-DE', {
            minimumFractionDigits: 2,
          })
        : '-',
      row.currency || '-',
      typeof row.percent === 'number'
        ? row.percent.toLocaleString('de-DE', {
            minimumFractionDigits: 2,
          })
        : '-',
      row.isVerified === true ? 'Yes' : row.isVerified === false ? 'No' : '-',
      row.note || '-',
      row.changedBy?.email || '-',
      row.createdAt ? dayjs(row.createdAt).format('DD/MM/YYYY - HH:mm') : '-',
      row.updatedAt ? dayjs(row.updatedAt).format('DD/MM/YYYY - HH:mm') : '-',
      row.isEnabled === true ? 'Yes' : row.isEnabled === false ? 'No' : '-',
    ],
  });
};

interface GameLimit {
  _id: string;
  category?: { name: string };
  provider?: { name: string };
  game?: { game_name: string; id: string };
  amount?: number;
  currency?: string;
  percent?: number;
  isVerified?: boolean;
  note?: string;
  changedBy?: { email?: string };
  createdAt?: string;
  updatedAt?: string;
  isEnabled?: boolean;
}

export const downloadCasinoStatsByGameCSV = (data: GameLimit[]) => {
  return exportToCSV({
    data,
    headers: [
      'ID of Limit',
      'Category',
      'Provider',
      'Game',
      'Game ID',
      'Amount',
      'Currency',
      'Percent',
      'Is Verified',
      'Note',
      'Changed By',
      'Created',
      'Updated',
      'Enable',
    ],
    filename: 'casino_stats_by_game.csv',
    rowMapper: (row: GameLimit): string[] => [
      row._id || '-',
      row.category?.name || '-',
      row.provider?.name || '-',
      row.game?.game_name || '-',
      row.game?.id || '-',
      typeof row.amount === 'number'
        ? row.amount.toLocaleString('de-DE', { minimumFractionDigits: 2 })
        : '-',
      row.currency || '-',
      typeof row.percent === 'number'
        ? row.percent.toLocaleString('de-DE', { minimumFractionDigits: 2 })
        : '-',
      row.isVerified === true ? 'Yes' : row.isVerified === false ? 'No' : '-',
      row.note || '-',
      row.changedBy?.email || '-',
      row.createdAt ? dayjs(row.createdAt).format('DD/MM/YYYY - HH:mm') : '-',
      row.updatedAt ? dayjs(row.updatedAt).format('DD/MM/YYYY - HH:mm') : '-',
      row.isEnabled === true ? 'Yes' : row.isEnabled === false ? 'No' : '-',
    ],
  });
};
