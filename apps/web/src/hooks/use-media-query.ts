import { useCallback, useSyncExternalStore } from 'react';

/** Matches a media query in the browser; false on the server and during hydration. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Tailwind's `md` breakpoint, where the layout switches from cards and dialogs to tables. */
export const DESKTOP_QUERY = '(min-width: 768px)';
