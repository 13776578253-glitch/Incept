'use client';

import type { ReactNode } from 'react';
import { ColorSchemeProvider } from '@/components/base/color-scheme-provider';
import { DocsCodePaletteProvider } from '@/components/base/docs-code-palette-provider';
import { EyeComfortFilterProvider } from '@/components/base/eye-comfort-filter-provider';
import { MusicPlayerPreferencesProvider } from '@/components/base/music-player-preferences-provider';
import { mountManifest, renderProviderWrappers } from '@/mount/registry';

// Browser-only preference providers belong behind one client boundary.
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ColorSchemeProvider>
      <DocsCodePaletteProvider>
        <EyeComfortFilterProvider />
        <MusicPlayerPreferencesProvider>
          {/* Provider 链贡献位（provider-chain 深度，有序）：music 在挂载收编阶段注册偏好 Provider wrapper */}
          {renderProviderWrappers(mountManifest, 'provider-chain', children)}
        </MusicPlayerPreferencesProvider>
      </DocsCodePaletteProvider>
    </ColorSchemeProvider>
  );
}
