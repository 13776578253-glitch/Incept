import type { ReactNode } from 'react';
import type { Viewport } from 'next';
import { cookies } from 'next/headers';
import {
  APPEARANCE_COOKIES,
  isAccentPreset,
  isColorScheme,
  isContrastMode,
  isThemePreset,
  isUiFont,
  isUiFontSize,
  resolveThemePolarity,
  type AccentPresetId,
  type ColorScheme,
  type ContrastMode,
  type ThemePresetId,
  type UiFontId,
  type UiFontSizeId,
} from '@incept/ui';
import { AppProviders } from '@/components/base/app-providers';
import {
  DOCS_CODE_PALETTE_COOKIE,
  isDocsCodePalette,
  type DocsCodePalette,
} from '@/features/docs/code-highlighting/palette';
import { mountManifest, renderProviderWrappers } from '@/mount/registry';
import './globals.css';

export const viewport: Viewport = {
  colorScheme: 'light dark',
};

export default async function AppLayout({ children }: { children: ReactNode }) {
  let preset: ThemePresetId = 'default';
  let colorScheme: ColorScheme = 'system';
  let accent: AccentPresetId = 'theme';
  let contrast: ContrastMode = 'default';
  let font: UiFontId = 'system';
  let fontSize: UiFontSizeId = '14';
  let codePalette: DocsCodePalette = 'auto';

  try {
    const store = await cookies();
    const rawPreset = store.get(APPEARANCE_COOKIES.preset)?.value;
    const rawScheme = store.get(APPEARANCE_COOKIES.colorScheme)?.value;
    const rawAccent = store.get(APPEARANCE_COOKIES.accent)?.value;
    const rawContrast = store.get(APPEARANCE_COOKIES.contrast)?.value;
    const rawFont = store.get(APPEARANCE_COOKIES.font)?.value;
    const rawFontSize = store.get(APPEARANCE_COOKIES.fontSize)?.value;
    const rawCodePalette = store.get(DOCS_CODE_PALETTE_COOKIE)?.value;

    if (isThemePreset(rawPreset)) preset = rawPreset;
    if (isColorScheme(rawScheme)) colorScheme = rawScheme;
    if (isAccentPreset(rawAccent)) accent = rawAccent;
    if (isContrastMode(rawContrast)) contrast = rawContrast;
    if (isUiFont(rawFont)) font = rawFont;
    if (isUiFontSize(rawFontSize)) fontSize = rawFontSize;
    if (isDocsCodePalette(rawCodePalette)) codePalette = rawCodePalette;
  } catch {
    // Fallback to defaults outside an active request scope
  }

  const resolvedPolarity = resolveThemePolarity(preset, colorScheme, false);

  return (
    <html
      suppressHydrationWarning
      className={resolvedPolarity === 'dark' ? 'dark' : undefined}
      data-theme-preset={preset}
      data-accent={accent}
      data-contrast={contrast}
      data-font={font}
      data-font-size={fontSize}
      data-code-palette={codePalette}
    >
      <body>
        <AppProviders>
          {/* 根布局包裹贡献位（root-layout 深度，有序）：music 的 RuntimeMount wrapper 由此注册 */}
          {renderProviderWrappers(mountManifest, 'root-layout', children)}
        </AppProviders>
      </body>
    </html>
  );
}
