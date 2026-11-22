'use client';

import { Search } from 'lucide-react';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';

const noopSubscribe = () => () => {};

function isApplePlatform(): boolean {
  return /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/**
 * Header search entry point: a wide button with its shortcut on desktop and an icon button on
 * mobile. Phase 3 placeholder: the shortcut only moves focus here; Phase 4 opens SymbolSearch.
 */
export function SearchTrigger() {
  // Server render and hydration use "Ctrl"; Apple devices switch to "⌘" right after.
  const isApple = useSyncExternalStore(noopSubscribe, isApplePlatform, () => false);
  const desktopRef = useRef<HTMLButtonElement>(null);
  const mobileRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      // Only one of the two buttons is displayed at a time; a hidden one has no offsetParent.
      const visible = [desktopRef.current, mobileRef.current].find(
        (button) => button?.offsetParent !== null,
      );
      visible?.focus();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <>
      <button
        ref={desktopRef}
        type="button"
        aria-keyshortcuts="Meta+K Control+K"
        className="hidden h-10 w-full max-w-sm items-center gap-2 rounded-md border border-input bg-surface px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:inline-flex"
      >
        <Search className="size-4" aria-hidden="true" />
        <span className="flex-1 text-left">Search symbol…</span>
        <kbd className="rounded-sm border border-border bg-background px-1.5 font-sans text-xs">
          {isApple ? '⌘K' : 'Ctrl K'}
        </kbd>
      </button>
      <Button
        ref={mobileRef}
        type="button"
        variant="ghost"
        size="icon-lg"
        aria-label="Search symbols"
        aria-keyshortcuts="Meta+K Control+K"
        className="md:hidden"
      >
        <Search className="size-5" aria-hidden="true" />
      </Button>
    </>
  );
}
