'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

interface SymbolSearchContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  /** Lets any page open the header search (dashboard `Add symbol`, empty state). */
  openSearch: () => void;
}

const SymbolSearchContext = createContext<SymbolSearchContextValue | null>(null);

export function SymbolSearchProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const value = useMemo(() => ({ open, setOpen, openSearch: () => setOpen(true) }), [open]);
  return <SymbolSearchContext.Provider value={value}>{children}</SymbolSearchContext.Provider>;
}

export function useSymbolSearch(): SymbolSearchContextValue {
  const value = useContext(SymbolSearchContext);
  if (!value) throw new Error('useSymbolSearch must be used inside SymbolSearchProvider');
  return value;
}
