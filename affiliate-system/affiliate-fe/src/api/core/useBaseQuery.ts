import { QueryKey, useQuery, UseQueryOptions } from '@tanstack/react-query';

import { baseService } from './baseService';

interface BaseQueryProps<T> {
  endpoint: string;
  queryKey?: QueryKey;
  enabled?: boolean;
  options?: UseQueryOptions<T, Error, T, QueryKey>;
  params?: Record<string, any>;
}

export const useBaseQuery = <T>({
  endpoint,
  queryKey,
  enabled = true,
  options,
  params,
}: BaseQueryProps<T>) => {
  const resolvedQueryKey = queryKey ?? options?.queryKey ?? [endpoint, params];
  const resolvedEnabled = options?.enabled ?? enabled;

  return useQuery<T>({
    ...options,
    queryKey: resolvedQueryKey,
    enabled: resolvedEnabled,
    queryFn: async () => {
      try {
        const result = await baseService.getAll<T>(endpoint, params);
        return result;
      } catch (error: unknown) {
        if (error instanceof Error) {
          throw new Error(error.message);
        }
        throw new Error('An unknown error occurred');
      }
    },
  });
};
