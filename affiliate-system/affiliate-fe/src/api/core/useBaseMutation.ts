import { useMutation, useQueryClient } from '@tanstack/react-query';

import { baseService } from './baseService';

interface MutationProps {
  endpoint: string;
  method?: 'post' | 'update' | 'delete' | 'patch';
  invalidateKeys?: string[];
  onSuccess?: (data: any) => void;
  onError?: (error: any) => void;
}

export const useBaseMutation = <TData = any, TVariables = any>({
  endpoint,
  method = 'update',
  invalidateKeys = [],
  onSuccess,
  onError,
}: MutationProps) => {
  const queryClient = useQueryClient();

  return useMutation<TData, unknown, TVariables>({
    mutationFn: async (variables) => {
      switch (method) {
        case 'post':
          return await baseService.add<TData>(endpoint, variables);
        case 'update':
          return await baseService.update<TData>(endpoint, variables);
        case 'delete':
          return await baseService.delete<TData>(endpoint, variables as any);
        case 'patch':
          return await baseService.patch<TData>(endpoint, variables);
        default:
          throw new Error('Invalid mutation method');
      }
    },
    onSuccess: (res) => {
      invalidateKeys.forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
      onSuccess?.(res);
    },
    onError: (err) => {
      console.error('Mutation failed:', err);
      onError?.(err);
    },
  });
};
