export const docsCodePaletteIds = ['vscode', 'github', 'vitesse'] as const;

export type DocsCodePalette = (typeof docsCodePaletteIds)[number];

// TODO: 未来可能会增加更多的调色板选项，例如：
// - dracula
// - monokai
// - solarized-light
// - solarized-dark

// 通过 Shiki 高亮库实现
export const DOCS_CODE_PALETTE_COOKIE = 'incept-code-palette';
export const DOCS_CODE_PALETTE_STORAGE_KEY = 'incept-code-palette';
export const DOCS_CODE_PALETTE_DATA_ATTRIBUTE = 'data-code-palette';

export const docsCodePalettes: Record<
  DocsCodePalette,
  {
    light: string;
    dark: string;
    warm: 'rose-pine-dawn';
  }
> = {
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
