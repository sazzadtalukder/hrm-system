import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './queryClient.js';
import { AuthProvider } from '../lib/auth/AuthContext.jsx';

export function AppProviders({ children }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}
