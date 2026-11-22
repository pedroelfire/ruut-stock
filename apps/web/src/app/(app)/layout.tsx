import { meResponseSchema } from '@ruut/shared';
import type { ReactNode } from 'react';
import { AppHeader } from '@/components/app-header';
import { apiServer } from '@/lib/api-server';

/**
 * Protected shell. proxy.ts already redirected visitors without a live cookie; asking the API who
 * the user is also catches tokens it rejects (apiServer sends those to /api/auth/expired).
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const { data } = await apiServer('auth/me', meResponseSchema);

  return (
    <>
      <AppHeader email={data.user.email} />
      <main id="main-content" className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>
    </>
  );
}
