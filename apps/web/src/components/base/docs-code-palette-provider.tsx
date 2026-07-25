'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { useDocsCodePalette } from '@/hooks/use-docs-code-palette';

type DocsCodePaletteContextValue = ReturnType<typeof useDocsCodePalette>;

const DocsCodePaletteContext = createContext<DocsCodePaletteContextValue | null>(null);

// Restores the selected palette before any Docs-specific settings UI is mounted.
export function DocsCodePaletteProvider({ children }: { children: ReactNode }) {
  const value = useDocsCodePalette();

  return (
    <DocsCodePaletteContext.Provider value={value}>
      {children}
    </DocsCodePaletteContext.Provider>
  );
}

export function useDocsCodePaletteContext() {
  const value = useContext(DocsCodePaletteContext);

  if (!value) {
    throw new Error('useDocsCodePaletteContext must be used within DocsCodePaletteProvider.');
  }

  return value;
}
