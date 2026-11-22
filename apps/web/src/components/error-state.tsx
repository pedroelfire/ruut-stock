'use client';

import { CircleAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ErrorStateProps {
  title: string;
  description?: string;
  /** Defaults to re-rendering the page on the server, for errors that come from it. */
  onRetry?: () => void;
  className?: string;
}

/** Human error message with `Try again`, never a technical code (conventions §6). */
export function ErrorState({
  title,
  description = 'Check your connection and try again.',
  onRetry,
  className,
}: ErrorStateProps) {
  const router = useRouter();
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center gap-3 rounded-lg border border-border bg-surface px-6 py-12 text-center',
        className,
      )}
    >
      <CircleAlert className="size-6 text-muted-foreground" aria-hidden="true" />
      <div className="space-y-1">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Button variant="outline" onClick={() => (onRetry ? onRetry() : router.refresh())}>
        Try again
      </Button>
    </div>
  );
}
