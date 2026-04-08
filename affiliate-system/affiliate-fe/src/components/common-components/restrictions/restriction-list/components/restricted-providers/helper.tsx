import { exportToCSV } from 'utils/common/exportToCSV';

interface RestrictedProviderItem {
  name: string;
}

export interface RestrictedProvidersApiResponse {
  data: RestrictedProviderItem[];
}

export const downloadRestrictedProvidersCSV = (response: RestrictedProvidersApiResponse) => {
  return exportToCSV({
    data: response.data,
    headers: ['Provider'],
    filename: 'restricted_providers_list.csv',
    rowMapper: (row: RestrictedProviderItem): string[] => [row.name || '-'],
  });
};
