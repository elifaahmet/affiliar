import {
  InfiniteData,
  QueryKey,
  useInfiniteQuery,
  UseInfiniteQueryResult,
} from '@tanstack/react-query';

import { baseService } from './baseService';

interface BaseInfiniteQueryProps<TPage, TPageParam = number> {
  endpoint: string;
  queryKey: QueryKey;
  getNextPageParam: (
    lastPage: TPage,
    allPages: TPage[],
    lastPageParam: TPageParam,
    allPageParams: TPageParam[]
  ) => TPageParam | undefined;
  initialPageParam?: TPageParam;
  enabled?: boolean;
  options?: any;
}

export const useBaseInfiniteQuery = <TPage, TPageParam = number>({
  endpoint,
  queryKey,
  getNextPageParam,
  initialPageParam = 0 as TPageParam,
  enabled = true,
  options = {},
}: BaseInfiniteQueryProps<TPage, TPageParam>): UseInfiniteQueryResult<
  InfiniteData<TPage>,
  Error
> => {
  return useInfiniteQuery<TPage, Error, InfiniteData<TPage>, QueryKey, TPageParam>({
    queryKey,
    queryFn: async ({ pageParam }) => {
      const url = `${
        endpoint.includes('?') ? endpoint + '&' : endpoint + '?'
      }page=${pageParam}&limit=10`;
      return await baseService.getAll<TPage>(url);
    },
    initialPageParam,
    getNextPageParam,
    enabled,
    ...options,
  });
};
