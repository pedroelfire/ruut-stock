'use client';

import { useEffect } from 'react';
import './globals.css';

/**
 * Last-resort boundary for errors in the root layout itself. It replaces the whole document, so it
 * renders its own <html> and <body> and avoids anything the failing layout provides.
 */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-dvh">
        <main className="mx-auto flex min-h-dvh max-w-6xl flex-col items-center justify-center gap-6 px-4 text-center sm:px-6">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold">Something went wrong</h1>
            <p className="text-sm text-muted-foreground">Check your connection and try again.</p>
          </div>
          <button
            type="button"
            onClick={() => retry()}
            className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
