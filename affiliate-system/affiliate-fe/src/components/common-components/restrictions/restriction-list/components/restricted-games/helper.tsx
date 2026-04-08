import { exportToCSV } from 'utils/common/exportToCSV';

interface RestrictedGameItem {
  provider: string;
  game_name: string;
}

export interface RestrictedGamesApiResponse {
  data: RestrictedGameItem[];
}

export const downloadRestrictedGamesCSV = (response: RestrictedGamesApiResponse) => {
  return exportToCSV({
    data: response.data,
    headers: ['Provider', 'Game Name'],
    filename: 'restricted_games_list.csv',
    rowMapper: (row: RestrictedGameItem): string[] => [row.provider || '-', row.game_name || '-'],
  });
};
