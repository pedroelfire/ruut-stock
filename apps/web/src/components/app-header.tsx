import Link from 'next/link';
import { Logo } from '@/components/logo';
import { SearchTrigger } from '@/components/search-trigger';
import { UserMenu } from '@/components/user-menu';

export function AppHeader({ email }: { email: string }) {
  return (
    <header className="sticky top-0 z-40 h-14 border-b border-border bg-background">
      <a
        href="#main-content"
        className="sr-only rounded-md bg-background px-3 py-2 text-sm focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:ring-2 focus:ring-ring focus:outline-none"
      >
        Skip to content
      </a>
      <div className="mx-auto flex h-full max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="flex h-10 items-center rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Logo />
        </Link>
        <div className="flex flex-1 justify-end md:justify-center">
          <SearchTrigger />
        </div>
        <UserMenu email={email} />
      </div>
    </header>
  );
}
