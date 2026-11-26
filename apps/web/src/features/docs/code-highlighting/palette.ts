export const docsCodePaletteIds = ['auto', 'vscode', 'github', 'vitesse'] as const;

export type DocsCodePalette = (typeof docsCodePaletteIds)[number];

// Shiki 高亮库
export const DOCS_CODE_PALETTE_COOKIE = 'incept-code-palette';
export const DOCS_CODE_PALETTE_STORAGE_KEY = 'incept-code-palette';
export const DOCS_CODE_PALETTE_DATA_ATTRIBUTE = 'data-code-palette';

export const docsCodePalettes: Record<
  DocsCodePalette,
  Record<string, string>
> = {
  auto: {
    light: 'github-light',
    dark: 'github-dark',
    warm: 'rose-pine-dawn',
    'catppuccin-latte': 'catppuccin-latte',
    'catppuccin-mocha': 'catppuccin-mocha',
    'rose-pine': 'rose-pine',
  },
  vscode: {
    light: 'light-plus',
    dark: 'dark-plus',
    warm: 'rose-pine-dawn',
  },
  github: {
    light: 'github-light',
    dark: 'github-dark',
    warm: 'rose-pine-dawn',
  },
  vitesse: {
    light: 'vitesse-light',
    dark: 'vitesse-dark',
    warm: 'rose-pine-dawn',
  },
};

export function isDocsCodePalette(value: string | null | undefined): value is DocsCodePalette {
  return value !== undefined && value !== null && docsCodePaletteIds.includes(value as DocsCodePalette);
}
