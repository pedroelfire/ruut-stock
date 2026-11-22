import type { ReactNode } from 'react';
import { Logo } from '@/components/logo';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 px-4 py-12 sm:px-6">
      <Logo />
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-6">
        {children}
      </div>
    </main>
  );
}
