import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from '@/components/logo';

interface StatusPageProps {
  title: string;
  description: string;
  /** Extra actions shown before the link back to the watchlist. */
  actions?: ReactNode;
}

/** Full-page message with the brand, used by not-found and error (spec 03 §2). */
export function StatusPage({ title, description, actions }: StatusPageProps) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-6xl flex-col items-center justify-center gap-6 px-4 text-center sm:px-6">
      <Link
        href="/"
        className="flex h-10 items-center rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <Logo />
      </Link>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        {actions}
        <Link
          href="/"
          className="inline-flex h-10 items-center rounded-md px-4 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Go to watchlist
        </Link>
      </div>
    </main>
  );
}
