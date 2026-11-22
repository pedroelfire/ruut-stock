import { Info } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthForm } from '@/components/auth-form';
import { getSafeNext } from '@/lib/safe-next';
import { firstParam, type SearchParams } from '@/lib/search-params';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const next = getSafeNext(firstParam(params, 'next'));
  const expired = firstParam(params, 'expired') === '1';
  const registerHref = next === '/' ? '/register' : `/register?${new URLSearchParams({ next })}`;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="text-sm text-muted-foreground">Track the stocks you care about.</p>
      </div>

      {expired && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <p>Your session expired. Please sign in again.</p>
        </div>
      )}

      <AuthForm mode="login" next={next} />

      <p className="text-center text-sm text-muted-foreground">
        New here?{' '}
        <Link
          href={registerHref}
          className="rounded-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}
