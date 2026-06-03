import { QueryClient } from '@tanstack/react-query';

/**
 * Single app-wide React Query client. Exported as a module singleton so
 * non-React code (e.g. the auth thunks) can clear the cache on operator
 * change — without this, an operator-agnostic query key like
 * ['refer-brands'] keeps the previous operator's data in memory and serves
 * it (refetchOnMount is off) until a hard refresh, leaking one tenant's
 * brands into another operator's session.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
      retry: false,
    },
  },
});

export default queryClient;
