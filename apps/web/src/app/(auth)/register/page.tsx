import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthForm } from '@/components/auth-form';
import { getSafeNext } from '@/lib/safe-next';
import { firstParam, type SearchParams } from '@/lib/search-params';

export const metadata: Metadata = { title: 'Create an account' };

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const next = getSafeNext(firstParam(params, 'next'));
  const loginHref = next === '/' ? '/login' : `/login?${new URLSearchParams({ next })}`;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Create an account</h1>
        <p className="text-sm text-muted-foreground">Start your watchlist in seconds.</p>
      </div>

      <AuthForm mode="register" next={next} />

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link
          href={loginHref}
          className="rounded-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
