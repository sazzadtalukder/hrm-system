import { QueryClient } from '@tanstack/react-query';

const noRetryStatuses = new Set([400, 401, 403, 404, 409, 422]);

function shouldRetry(failureCount, error) {
  if (failureCount >= 2 || noRetryStatuses.has(error?.status)) return false;
  return error?.status === 0 || error?.status >= 500;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: shouldRetry,
      refetchOnWindowFocus: false,
    },
    mutations: { retry: false },
  },
});
