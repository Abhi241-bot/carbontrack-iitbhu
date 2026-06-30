import { QueryClient } from '@tanstack/react-query';

// TODO: Phase 2 — wire toast notifications for query errors
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {},
  },
});
