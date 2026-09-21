'use client';

import type { ReactNode } from 'react';
import { ColorSchemeProvider } from '@/components/base/color-scheme-provider';
import { DocsCodePaletteProvider } from '@/components/base/docs-code-palette-provider';
import { EyeComfortFilterProvider } from '@/components/base/eye-comfort-filter-provider';
import { MusicPlayerPreferencesProvider } from '@/components/base/music-player-preferences-provider';

// Browser-only preference providers belong behind one client boundary.
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ColorSchemeProvider>
      <DocsCodePaletteProvider>
        <EyeComfortFilterProvider />
        <MusicPlayerPreferencesProvider>{children}</MusicPlayerPreferencesProvider>
      </DocsCodePaletteProvider>
    </ColorSchemeProvider>
  );
}
