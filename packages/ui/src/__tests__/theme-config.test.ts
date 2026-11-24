import { describe, expect, it } from 'vitest';

import {
  ACCENT_CONTRAST_MODE_IDS,
  DOCS_CODE_ACCENT_IDS,
  DOCS_FONT_IDS,
  DOCS_FONT_SIZE_IDS,
  DOCS_IMAGE_SCALE_IDS,
  DOCS_INLINE_CODE_ACCENT_IDS,
  DOCS_LINE_HEIGHT_IDS,
  UI_FONTS,
  UI_FONT_SIZES,
  buildAppearanceInitScript,
  getColorSchemeMetaContent,
  getSmartToggleTarget,
  isAccentContrastMode,
  isDocsCodeAccent,
  isDocsFont,
  isDocsFontSize,
  isDocsImageScale,
  isDocsInlineCodeAccent,
  isDocsLineHeight,
  isUiFont,
  isUiFontSize,
  migrateLegacyEyeComfort,
  resolveThemePolarity,
} from '../tokens/theme-config';

describe('theme-config', () => {
  it('resolves polarity for fixed-polarity and system-following presets', () => {
    expect(resolveThemePolarity('default', 'system', false)).toBe('light');
    expect(resolveThemePolarity('default', 'system', true)).toBe('dark');
    expect(resolveThemePolarity('default', 'dark', false)).toBe('dark');
    expect(resolveThemePolarity('default', 'light', true)).toBe('light');
    expect(resolveThemePolarity('warm-paper', 'dark', true)).toBe('light');
    expect(resolveThemePolarity('catppuccin-latte', 'dark', true)).toBe('light');
    expect(resolveThemePolarity('rose-pine-dawn', 'dark', true)).toBe('light');
    expect(resolveThemePolarity('catppuccin-mocha', 'light', false)).toBe('dark');
    expect(resolveThemePolarity('rose-pine', 'light', false)).toBe('dark');
  });

  it('keeps meta color-scheme as light dark only for default system mode', () => {
    expect(getColorSchemeMetaContent('default', 'system')).toBe('light dark');
    expect(getColorSchemeMetaContent('default', 'light')).toBe('light');
    expect(getColorSchemeMetaContent('default', 'dark')).toBe('dark');
    expect(getColorSchemeMetaContent('catppuccin-mocha', 'system')).toBe('dark');
    expect(getColorSchemeMetaContent('warm-paper', 'system')).toBe('light');
  });

  it('toggles paired presets and reverts default to system when target matches OS', () => {
    expect(getSmartToggleTarget('default', 'system', false)).toEqual({
      preset: 'default',
      colorScheme: 'dark',
    });
    expect(getSmartToggleTarget('default', 'dark', false)).toEqual({
      preset: 'default',
      colorScheme: 'system',
    });
    expect(getSmartToggleTarget('default', 'light', true)).toEqual({
      preset: 'default',
      colorScheme: 'system',
    });
    expect(getSmartToggleTarget('catppuccin-latte', 'system', false)).toEqual({
      preset: 'catppuccin-mocha',
      colorScheme: 'system',
    });
    expect(getSmartToggleTarget('catppuccin-mocha', 'system', true)).toEqual({
      preset: 'catppuccin-latte',
      colorScheme: 'system',
    });
    expect(getSmartToggleTarget('rose-pine-dawn', 'system', false)).toEqual({
      preset: 'rose-pine',
      colorScheme: 'system',
    });
    expect(getSmartToggleTarget('rose-pine', 'system', true)).toEqual({
      preset: 'rose-pine-dawn',
      colorScheme: 'system',
    });
    expect(getSmartToggleTarget('warm-paper', 'system', false)).toEqual({
      preset: 'default',
      colorScheme: 'dark',
    });
  });

  it('migrates legacy eye-comfort storage to warm-paper once', () => {
    expect(migrateLegacyEyeComfort(null, 'true')).toBe('warm-paper');
    expect(migrateLegacyEyeComfort('catppuccin-mocha', 'true')).toBe('catppuccin-mocha');
    expect(migrateLegacyEyeComfort(null, 'false')).toBe('default');
  });

  it('supports extended font families and compact font sizes', () => {
    expect(UI_FONTS.map((f) => f.id)).toEqual([
      'system',
      'sans',
      'geometric',
      'humanist',
      'serif',
      'kai',
      'mono',
    ]);
    expect(UI_FONT_SIZES.map((s) => s.id)).toEqual(['11', '12', '13', '14', '15', '16']);
    expect(isUiFont('geometric')).toBe(true);
    expect(isUiFont('humanist')).toBe(true);
    expect(isUiFont('kai')).toBe(true);
    expect(isUiFontSize('11')).toBe(true);
    expect(isUiFontSize('12')).toBe(true);
  });

  it('supports independent docs font, font size, line height, and code accent options', () => {
    expect(DOCS_FONT_IDS).toContain('inherit');
    expect(DOCS_FONT_IDS).toContain('serif');
    expect(DOCS_FONT_SIZE_IDS).toEqual(['inherit', '12', '13', '14', '15', '16', '17', '18']);
    expect(DOCS_LINE_HEIGHT_IDS).toEqual(['compact', 'comfortable', 'relaxed']);
    expect(DOCS_CODE_ACCENT_IDS).toContain('inherit');
    expect(DOCS_CODE_ACCENT_IDS).toContain('none');
    expect(DOCS_CODE_ACCENT_IDS).toContain('mist-blue');
    expect(DOCS_INLINE_CODE_ACCENT_IDS).toEqual(DOCS_CODE_ACCENT_IDS);
    expect(ACCENT_CONTRAST_MODE_IDS).toEqual(['default', 'strong']);
    expect(DOCS_IMAGE_SCALE_IDS).toEqual(['100', '90', '80', '70', '60']);
    expect(isAccentContrastMode('default')).toBe(true);
    expect(isAccentContrastMode('strong')).toBe(true);
    expect(isAccentContrastMode('soft')).toBe(false);
    expect(isDocsImageScale('90')).toBe(true);
    expect(isDocsImageScale('50')).toBe(false);
    expect(isDocsFont('inherit')).toBe(true);
    expect(isDocsFont('kai')).toBe(true);
    expect(isDocsFont('unknown')).toBe(false);
    expect(isDocsFontSize('12')).toBe(true);
    expect(isDocsFontSize('13')).toBe(true);
    expect(isDocsFontSize('17')).toBe(true);
    expect(isDocsFontSize('11')).toBe(false);
    expect(isDocsLineHeight('relaxed')).toBe(true);
    expect(isDocsLineHeight('loose')).toBe(false);
    expect(isDocsCodeAccent('inherit')).toBe(true);
    expect(isDocsCodeAccent('none')).toBe(true);
    expect(isDocsCodeAccent('sage')).toBe(true);
    expect(isDocsCodeAccent('theme')).toBe(false);
    expect(isDocsInlineCodeAccent('none')).toBe(true);
    expect(isDocsInlineCodeAccent('amber')).toBe(true);
  });

  it('produces a valid synchronous init script without syntax errors', () => {
    const script = buildAppearanceInitScript();
    expect(() => new Function(script)).not.toThrow();
    expect(script).toContain('"11"');
    expect(script).toContain('"kai"');
    expect(script).toContain('data-docs-font');
    expect(script).toContain('data-docs-font-size');
    expect(script).toContain('data-docs-line-height');
    expect(script).toContain('data-docs-code-accent');
    expect(script).toContain('data-docs-inline-code-accent');
    expect(script).toContain('data-accent-contrast');
    expect(script).toContain('data-docs-image-scale');
  });
});
