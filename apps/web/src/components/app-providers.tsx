'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { RateLimitProvider } from '@/components/rate-limit-provider';
import { SymbolSearchProvider } from '@/components/symbol-search-context';
import { createQueryClient } from '@/lib/query-client';
import { EXPIRED_SESSION_PATH } from '@/lib/session-paths';

/** Client-side providers of the protected shell: data cache, rate limit banner and search. */
export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => {
    let redirecting = false;
    const client = createQueryClient({
      onUnauthorized: () => {
        if (redirecting) return;
        redirecting = true;
        // Nothing cached for this session may outlive it. A full navigation, because the route
        // handler clears the httpOnly cookie before landing on /login?expired=1.
        client.clear();
        window.location.assign(EXPIRED_SESSION_PATH);
      },
    });
    return client;
  });

  return (
    <QueryClientProvider client={queryClient}>
      <RateLimitProvider>
        <SymbolSearchProvider>{children}</SymbolSearchProvider>
      </RateLimitProvider>
    </QueryClientProvider>
  );
}
