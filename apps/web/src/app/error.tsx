'use client';

import { useEffect } from 'react';
import { StatusPage } from '@/components/status-page';
import { Button } from '@/components/ui/button';

export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <StatusPage
      title="Something went wrong"
      description="Check your connection and try again."
      actions={
        <Button size="lg" onClick={() => retry()}>
          Try again
        </Button>
      }
    />
  );
}
