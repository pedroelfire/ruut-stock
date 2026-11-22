import { useSyncExternalStore } from 'react';

function subscribeEverySecond(onTick: () => void): () => void {
  const interval = setInterval(onTick, 1000);
  return () => clearInterval(interval);
}

const nowInSeconds = () => Math.floor(Date.now() / 1000);

/** Read at render time on purpose: the clock subscription below is what re-renders. */
function secondsUntil(deadlineMs: number): number {
  return Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000));
}

/**
 * Whole seconds left until `deadlineMs` (epoch milliseconds), re-rendering once per second. The
 * server renders the real value too; elements that show it need `suppressHydrationWarning`,
 * since a second may pass before hydration.
 */
export function useSecondsLeft(deadlineMs: number): number {
  useSyncExternalStore(subscribeEverySecond, nowInSeconds, nowInSeconds);
  return secondsUntil(deadlineMs);
}
