export const THEME_PRESET_IDS = [
  'default',
  'warm-paper',
  'catppuccin-latte',
  'catppuccin-mocha',
  'rose-pine-dawn',
  'rose-pine',
] as const;

export type ThemePresetId = (typeof THEME_PRESET_IDS)[number];

export const COLOR_SCHEME_IDS = ['system', 'light', 'dark'] as const;
export type ColorScheme = (typeof COLOR_SCHEME_IDS)[number];

export const ACCENT_PRESET_IDS = [
  'theme',
  'neutral',
  'mist-blue',
  'cobalt',
  'dusty-rose',
  'sage',
  'amber',
] as const;

export type AccentPresetId = (typeof ACCENT_PRESET_IDS)[number];

export const CONTRAST_MODE_IDS = ['default', 'strong'] as const;
export type ContrastMode = (typeof CONTRAST_MODE_IDS)[number];

export const ACCENT_CONTRAST_MODE_IDS = ['default', 'strong'] as const;
export type AccentContrastMode = (typeof ACCENT_CONTRAST_MODE_IDS)[number];

export const UI_FONT_IDS = ['system', 'sans', 'geometric', 'humanist', 'serif', 'kai', 'mono'] as const;
export type UiFontId = (typeof UI_FONT_IDS)[number];

export const UI_FONT_SIZE_IDS = ['11', '12', '13', '14', '15', '16'] as const;
export type UiFontSizeId = (typeof UI_FONT_SIZE_IDS)[number];

export const DOCS_FONT_IDS = ['inherit', ...UI_FONT_IDS] as const;
export type DocsFontId = (typeof DOCS_FONT_IDS)[number];

export const DOCS_FONT_SIZE_IDS = ['inherit', '12', '13', '14', '15', '16', '17', '18'] as const;
export type DocsFontSizeId = (typeof DOCS_FONT_SIZE_IDS)[number];

export const DOCS_LINE_HEIGHT_IDS = ['compact', 'comfortable', 'relaxed'] as const;
export type DocsLineHeightId = (typeof DOCS_LINE_HEIGHT_IDS)[number];

export const DOCS_IMAGE_SCALE_IDS = ['100', '90', '80', '70', '60'] as const;
export type DocsImageScaleId = (typeof DOCS_IMAGE_SCALE_IDS)[number];

export const DOCS_CODE_ACCENT_IDS = [
  'inherit',
  'none',
  'neutral',
  'mist-blue',
  'cobalt',
  'dusty-rose',
  'sage',
  'amber',
] as const;
export type DocsCodeAccentId = (typeof DOCS_CODE_ACCENT_IDS)[number];

export const DOCS_INLINE_CODE_ACCENT_IDS = DOCS_CODE_ACCENT_IDS;
export type DocsInlineCodeAccentId = DocsCodeAccentId;

export type ResolvedPolarity = 'light' | 'dark';

export type ThemePresetPreview = {
  bg: string;
  surface: string;
  border: string;
  text: string;
  accent: string;
  dots: readonly [string, string, string];
};

export type ThemePresetSpec = {
  id: ThemePresetId;
  polarity: 'system' | ResolvedPolarity;
  label: { zh: string; en: string };
  description: { zh: string; en: string };
  preview: {
    light: ThemePresetPreview;
    dark?: ThemePresetPreview;
  };
};

export const THEME_PRESETS: readonly ThemePresetSpec[] = [
  {
    id: 'default',
    polarity: 'system',
    label: { zh: '默认', en: 'Default' },
    description: { zh: '极简纯白与纯黑，跟随亮暗或系统模式', en: 'Crisp pure white and black, follows light, dark, or system' },
    preview: {
      light: {
        bg: '#ffffff',
        surface: '#fafafa',
        border: 'rgba(17, 17, 17, 0.1)',
        text: '#141517',
        accent: '#171717',
        dots: ['#5279a8', '#4c806d', '#a86575'],
      },
      dark: {
        bg: '#050505',
        surface: '#111114',
        border: 'rgba(255, 255, 255, 0.12)',
        text: '#f3f4f6',
        accent: '#f3f4f6',
        dots: ['#8baed6', '#7db09c', '#d499a8'],
      },
    },
  },
  {
    id: 'warm-paper',
    polarity: 'light',
    label: { zh: '暖纸', en: 'Warm Paper' },
    description: { zh: '柔和暖黄纸张感，适合长时间阅读', en: 'Soft warm paper tint for long-form reading' },
    preview: {
      light: {
        bg: '#f6efe2',
        surface: '#fcf8ef',
        border: 'rgba(94, 77, 59, 0.14)',
        text: '#3f3326',
        accent: '#9e7346',
        dots: ['#9e7346', '#4c806d', '#a86575'],
      },
    },
  },
  {
    id: 'catppuccin-latte',
    polarity: 'light',
    label: { zh: 'Latte', en: 'Latte' },
    description: { zh: 'Catppuccin 柔和亮色粉彩', en: 'Catppuccin soft daylight pastels' },
    preview: {
      light: {
        bg: '#f6f7f9',
        surface: '#fbfcfd',
        border: 'rgba(63, 67, 84, 0.09)',
        text: '#3f4354',
        accent: '#6782a8',
        dots: ['#6782a8', '#5b8a78', '#a36e7d'],
      },
    },
  },
  {
    id: 'catppuccin-mocha',
    polarity: 'dark',
    label: { zh: 'Mocha', en: 'Mocha' },
    description: { zh: 'Catppuccin 柔暗深邃粉彩', en: 'Catppuccin rich dark pastels' },
    preview: {
      light: {
        bg: '#181825',
        surface: '#1e1e2e',
        border: 'rgba(205, 214, 244, 0.12)',
        text: '#cdd6f4',
        accent: '#89a8e0',
        dots: ['#b4a0dc', '#8ec49b', '#d494a7'],
      },
    },
  },
  {
    id: 'rose-pine-dawn',
    polarity: 'light',
    label: { zh: 'Rosé Pine Dawn', en: 'Rosé Pine Dawn' },
    description: { zh: '暖奶白与低饱和玫瑰灰调', en: 'Warm cream with muted rose and slate' },
    preview: {
      light: {
        bg: '#f5ede4',
        surface: '#fffaf3',
        border: 'rgba(87, 82, 121, 0.13)',
        text: '#575279',
        accent: '#a36579',
        dots: ['#8a78a1', '#568d97', '#a36579'],
      },
    },
  },
  {
    id: 'rose-pine',
    polarity: 'dark',
    label: { zh: 'Rosé Pine', en: 'Rosé Pine' },
    description: { zh: '低眩光暮夜玫瑰暗色', en: 'Low-glare twilight rose dark palette' },
    preview: {
      light: {
        bg: '#191724',
        surface: '#1f1d2e',
        border: 'rgba(224, 222, 244, 0.12)',
        text: '#e0def4',
        accent: '#d9adb0',
        dots: ['#b79ed9', '#8cbcc4', '#d4829c'],
      },
    },
  },
];

export type AccentPresetSpec = {
  id: AccentPresetId;
  label: { zh: string; en: string };
  swatch: { light: string; dark: string };
};

export const ACCENT_PRESETS: readonly AccentPresetSpec[] = [
  { id: 'theme', label: { zh: '跟随主题', en: 'Theme' }, swatch: { light: '#171717', dark: '#f3f4f6' } },
  { id: 'neutral', label: { zh: '墨石', en: 'Neutral' }, swatch: { light: '#3f3f46', dark: '#d4d4d8' } },
  { id: 'mist-blue', label: { zh: '柔雾蓝', en: 'Mist Blue' }, swatch: { light: '#5279a8', dark: '#8baed6' } },
  { id: 'cobalt', label: { zh: '静谧靛', en: 'Cobalt' }, swatch: { light: '#5d63a8', dark: '#969bd6' } },
  { id: 'dusty-rose', label: { zh: '干枯玫瑰', en: 'Dusty Rose' }, swatch: { light: '#a86575', dark: '#d499a8' } },
  { id: 'sage', label: { zh: '鼠尾草', en: 'Sage' }, swatch: { light: '#4c806d', dark: '#7db09c' } },
  { id: 'amber', label: { zh: '暖麦琥珀', en: 'Amber' }, swatch: { light: '#a67a44', dark: '#d1a672' } },
];

export const UI_FONTS: ReadonlyArray<{
  id: UiFontId;
  label: { zh: string; en: string };
  previewStack: string;
}> = [
  {
    id: 'system',
    label: { zh: '系统默认', en: 'System Default' },
    previewStack: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif",
  },
  {
    id: 'sans',
    label: { zh: '现代无衬线', en: 'Modern Sans' },
    previewStack: "'Inter', 'SF Pro Text', 'Helvetica Neue', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei UI', sans-serif",
  },
  {
    id: 'geometric',
    label: { zh: '几何无衬线', en: 'Geometric Sans' },
    previewStack: "'Avenir Next', 'Century Gothic', 'Trebuchet MS', 'HarmonyOS Sans SC', 'MiSans', 'Microsoft YaHei', sans-serif",
  },
  {
    id: 'humanist',
    label: { zh: '人文无衬线', en: 'Humanist Sans' },
    previewStack: "'Optima', 'Candara', 'Calibri', 'Source Han Sans SC', 'Noto Sans SC', 'DengXian', 'Microsoft YaHei', sans-serif",
  },
  {
    id: 'serif',
    label: { zh: '编辑衬线', en: 'Editorial Serif' },
    previewStack: "'Georgia', 'Cambria', 'Times New Roman', 'Songti SC', 'Noto Serif SC', 'STSong', 'SimSun', serif",
  },
  {
    id: 'kai',
    label: { zh: '楷体书卷', en: 'Calligraphic Kai' },
    previewStack: "'Baskerville', 'Palatino Linotype', Georgia, 'Kaiti SC', 'STKaiti', 'KaiTi', 'FangSong', serif",
  },
  {
    id: 'mono',
    label: { zh: '等宽代码', en: 'Monospace' },
    previewStack: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  },
];

export const UI_FONT_SIZES: ReadonlyArray<{
  id: UiFontSizeId;
  label: string;
}> = [
  { id: '11', label: '11px' },
  { id: '12', label: '12px' },
  { id: '13', label: '13px' },
  { id: '14', label: '14px' },
  { id: '15', label: '15px' },
  { id: '16', label: '16px' },
];

export const DOCS_FONT_SIZES: ReadonlyArray<{
  id: DocsFontSizeId;
  label: { zh: string; en: string };
}> = [
  { id: 'inherit', label: { zh: '跟随全局', en: 'Follow Global' } },
  { id: '12', label: { zh: '12px', en: '12px' } },
  { id: '13', label: { zh: '13px', en: '13px' } },
  { id: '14', label: { zh: '14px', en: '14px' } },
  { id: '15', label: { zh: '15px', en: '15px' } },
  { id: '16', label: { zh: '16px', en: '16px' } },
  { id: '17', label: { zh: '17px', en: '17px' } },
  { id: '18', label: { zh: '18px', en: '18px' } },
];

export const DOCS_LINE_HEIGHTS: ReadonlyArray<{
  id: DocsLineHeightId;
  label: { zh: string; en: string };
}> = [
  { id: 'compact', label: { zh: '紧凑', en: 'Compact' } },
  { id: 'comfortable', label: { zh: '适中', en: 'Comfortable' } },
  { id: 'relaxed', label: { zh: '舒展', en: 'Relaxed' } },
];

export const DOCS_IMAGE_SCALES: ReadonlyArray<{
  id: DocsImageScaleId;
  label: { zh: string; en: string };
}> = [
  { id: '100', label: { zh: '100%（原始）', en: '100% (Full)' } },
  { id: '90', label: { zh: '90%（默认）', en: '90% (Default)' } },
  { id: '80', label: { zh: '80%', en: '80%' } },
  { id: '70', label: { zh: '70%', en: '70%' } },
  { id: '60', label: { zh: '60%', en: '60%' } },
];

export const APPEARANCE_STORAGE_KEYS = {
  preset: 'incept-theme-preset',
  colorScheme: 'incept-color-scheme',
  accent: 'incept-accent',
  accentContrast: 'incept-accent-contrast',
  contrast: 'incept-contrast',
  font: 'incept-font',
  fontSize: 'incept-font-size',
  docsFont: 'incept-docs-font',
  docsFontSize: 'incept-docs-font-size',
  docsLineHeight: 'incept-docs-line-height',
  docsImageScale: 'incept-docs-image-scale',
  docsCodeAccent: 'incept-docs-code-accent',
  docsInlineCodeAccent: 'incept-docs-inline-code-accent',
  legacyEyeComfort: 'incept-eye-comfort-filter',
} as const;

export const APPEARANCE_ATTRIBUTES = {
  preset: 'data-theme-preset',
  accent: 'data-accent',
  accentContrast: 'data-accent-contrast',
  contrast: 'data-contrast',
  font: 'data-font',
  fontSize: 'data-font-size',
  docsFont: 'data-docs-font',
  docsFontSize: 'data-docs-font-size',
  docsLineHeight: 'data-docs-line-height',
  docsImageScale: 'data-docs-image-scale',
  docsCodeAccent: 'data-docs-code-accent',
  docsInlineCodeAccent: 'data-docs-inline-code-accent',
} as const;

export const APPEARANCE_COOKIES = {
  preset: 'incept-theme-preset',
  colorScheme: 'incept-color-scheme',
  accent: 'incept-accent',
  accentContrast: 'incept-accent-contrast',
  contrast: 'incept-contrast',
  font: 'incept-font',
  fontSize: 'incept-font-size',
  docsFont: 'incept-docs-font',
  docsFontSize: 'incept-docs-font-size',
  docsLineHeight: 'incept-docs-line-height',
  docsImageScale: 'incept-docs-image-scale',
  docsCodeAccent: 'incept-docs-code-accent',
  docsInlineCodeAccent: 'incept-docs-inline-code-accent',
} as const;

const THEME_PRESET_MAP = new Map<ThemePresetId, ThemePresetSpec>(
  THEME_PRESETS.map((preset) => [preset.id, preset]),
);

export function isThemePreset(value: string | null | undefined): value is ThemePresetId {
  return value !== null && value !== undefined && THEME_PRESET_IDS.includes(value as ThemePresetId);
}

export function isColorScheme(value: string | null | undefined): value is ColorScheme {
  return value !== null && value !== undefined && COLOR_SCHEME_IDS.includes(value as ColorScheme);
}

export function isAccentPreset(value: string | null | undefined): value is AccentPresetId {
  return value !== null && value !== undefined && ACCENT_PRESET_IDS.includes(value as AccentPresetId);
}

export function isContrastMode(value: string | null | undefined): value is ContrastMode {
  return value !== null && value !== undefined && CONTRAST_MODE_IDS.includes(value as ContrastMode);
}

export function isAccentContrastMode(value: string | null | undefined): value is AccentContrastMode {
  return (
    value !== null &&
    value !== undefined &&
    ACCENT_CONTRAST_MODE_IDS.includes(value as AccentContrastMode)
  );
}

export function isUiFont(value: string | null | undefined): value is UiFontId {
  return value !== null && value !== undefined && UI_FONT_IDS.includes(value as UiFontId);
}

export function isUiFontSize(value: string | null | undefined): value is UiFontSizeId {
  return value !== null && value !== undefined && UI_FONT_SIZE_IDS.includes(value as UiFontSizeId);
}

export function isDocsFont(value: string | null | undefined): value is DocsFontId {
  return value !== null && value !== undefined && DOCS_FONT_IDS.includes(value as DocsFontId);
}

export function isDocsFontSize(value: string | null | undefined): value is DocsFontSizeId {
  return value !== null && value !== undefined && DOCS_FONT_SIZE_IDS.includes(value as DocsFontSizeId);
}

export function isDocsLineHeight(value: string | null | undefined): value is DocsLineHeightId {
  return value !== null && value !== undefined && DOCS_LINE_HEIGHT_IDS.includes(value as DocsLineHeightId);
}

export function isDocsImageScale(value: string | null | undefined): value is DocsImageScaleId {
  return value !== null && value !== undefined && DOCS_IMAGE_SCALE_IDS.includes(value as DocsImageScaleId);
}

export function isDocsCodeAccent(value: string | null | undefined): value is DocsCodeAccentId {
  return value !== null && value !== undefined && DOCS_CODE_ACCENT_IDS.includes(value as DocsCodeAccentId);
}

export function isDocsInlineCodeAccent(value: string | null | undefined): value is DocsInlineCodeAccentId {
  return isDocsCodeAccent(value);
}

export function getThemePresetSpec(preset: ThemePresetId): ThemePresetSpec {
  return THEME_PRESET_MAP.get(preset) ?? THEME_PRESETS[0];
}

export function resolveThemePolarity(
  preset: ThemePresetId,
  colorScheme: ColorScheme,
  systemPrefersDark: boolean,
): ResolvedPolarity {
  const spec = getThemePresetSpec(preset);
  if (spec.polarity !== 'system') {
    return spec.polarity;
  }
  if (colorScheme === 'dark' || colorScheme === 'light') {
    return colorScheme;
  }
  return systemPrefersDark ? 'dark' : 'light';
}

export function getColorSchemeMetaContent(
  preset: ThemePresetId,
  colorScheme: ColorScheme,
): 'light dark' | 'light' | 'dark' {
  const spec = getThemePresetSpec(preset);
  if (spec.polarity !== 'system') {
    return spec.polarity;
  }
  if (colorScheme === 'light' || colorScheme === 'dark') {
    return colorScheme;
  }
  return 'light dark';
}

export function getSmartToggleTarget(
  preset: ThemePresetId,
  colorScheme: ColorScheme,
  systemPrefersDark: boolean,
): { preset: ThemePresetId; colorScheme: ColorScheme } {
  switch (preset) {
    case 'catppuccin-latte':
      return { preset: 'catppuccin-mocha', colorScheme };
    case 'catppuccin-mocha':
      return { preset: 'catppuccin-latte', colorScheme };
    case 'rose-pine-dawn':
      return { preset: 'rose-pine', colorScheme };
    case 'rose-pine':
      return { preset: 'rose-pine-dawn', colorScheme };
    case 'warm-paper':
      return { preset: 'default', colorScheme: 'dark' };
    case 'default': {
      const currentIsDark = resolveThemePolarity('default', colorScheme, systemPrefersDark) === 'dark';
      const targetIsDark = !currentIsDark;
      if (targetIsDark === systemPrefersDark) {
        return { preset: 'default', colorScheme: 'system' };
      }
      return { preset: 'default', colorScheme: targetIsDark ? 'dark' : 'light' };
    }
  }
}

export function migrateLegacyEyeComfort(
  storedPreset: string | null | undefined,
  legacyEyeComfort: string | null | undefined,
): ThemePresetId {
  if (isThemePreset(storedPreset)) {
    return storedPreset;
  }
  if (legacyEyeComfort === 'true') {
    return 'warm-paper';
  }
  return 'default';
}

export function buildAppearanceInitScript(): string {
  return `(function(){try{var d=document.documentElement,ls=window.localStorage,p=ls.getItem(${JSON.stringify(APPEARANCE_STORAGE_KEYS.preset)}),leg=ls.getItem(${JSON.stringify(APPEARANCE_STORAGE_KEYS.legacyEyeComfort)}),sc=ls.getItem(${JSON.stringify(APPEARANCE_STORAGE_KEYS.colorScheme)}),ac=ls.getItem(${JSON.stringify(APPEARANCE_STORAGE_KEYS.accent)}),acc=ls.getItem(${JSON.stringify(APPEARANCE_STORAGE_KEYS.accentContrast)}),ct=ls.getItem(${JSON.stringify(APPEARANCE_STORAGE_KEYS.contrast)}),fn=ls.getItem(${JSON.stringify(APPEARANCE_STORAGE_KEYS.font)}),fs=ls.getItem(${JSON.stringify(APPEARANCE_STORAGE_KEYS.fontSize)}),df=ls.getItem(${JSON.stringify(APPEARANCE_STORAGE_KEYS.docsFont)}),dfs=ls.getItem(${JSON.stringify(APPEARANCE_STORAGE_KEYS.docsFontSize)}),dlh=ls.getItem(${JSON.stringify(APPEARANCE_STORAGE_KEYS.docsLineHeight)}),dis=ls.getItem(${JSON.stringify(APPEARANCE_STORAGE_KEYS.docsImageScale)}),dca=ls.getItem(${JSON.stringify(APPEARANCE_STORAGE_KEYS.docsCodeAccent)}),dica=ls.getItem(${JSON.stringify(APPEARANCE_STORAGE_KEYS.docsInlineCodeAccent)}),cp=ls.getItem('incept-code-palette');var vp=${JSON.stringify(THEME_PRESET_IDS)},va=${JSON.stringify(ACCENT_PRESET_IDS)},vac=${JSON.stringify(ACCENT_CONTRAST_MODE_IDS)},vc=${JSON.stringify(CONTRAST_MODE_IDS)},vf=${JSON.stringify(UI_FONT_IDS)},vs=${JSON.stringify(UI_FONT_SIZE_IDS)},vdf=${JSON.stringify(DOCS_FONT_IDS)},vdfs=${JSON.stringify(DOCS_FONT_SIZE_IDS)},vdlh=${JSON.stringify(DOCS_LINE_HEIGHT_IDS)},vdis=${JSON.stringify(DOCS_IMAGE_SCALE_IDS)},vdca=${JSON.stringify(DOCS_CODE_ACCENT_IDS)},vcp=['auto','vscode','github','vitesse'];if(vp.indexOf(p)===-1){p=leg==='true'?'warm-paper':'default';if(leg==='true'){ls.setItem(${JSON.stringify(APPEARANCE_STORAGE_KEYS.preset)},'warm-paper');ls.removeItem(${JSON.stringify(APPEARANCE_STORAGE_KEYS.legacyEyeComfort)});}}if(sc!=='light'&&sc!=='dark'&&sc!=='system'){sc='system';}if(va.indexOf(ac)===-1)ac='theme';if(vac.indexOf(acc)===-1)acc='default';if(vc.indexOf(ct)===-1)ct='default';if(vf.indexOf(fn)===-1)fn='system';if(vs.indexOf(fs)===-1)fs='14';if(vdf.indexOf(df)===-1)df='inherit';if(vdfs.indexOf(dfs)===-1)dfs='inherit';if(vdlh.indexOf(dlh)===-1)dlh='comfortable';if(vdis.indexOf(dis)===-1)dis='90';if(vdca.indexOf(dca)===-1)dca='inherit';if(vdca.indexOf(dica)===-1)dica='inherit';if(vcp.indexOf(cp)===-1)cp='auto';var sys=window.matchMedia('(prefers-color-scheme: dark)').matches;var dark=(p==='catppuccin-mocha'||p==='rose-pine')?true:(p==='warm-paper'||p==='catppuccin-latte'||p==='rose-pine-dawn')?false:(sc==='dark'||(sc==='system'&&sys));var mc=(p==='default'&&sc==='system')?'light dark':(dark?'dark':'light');var m=document.querySelector('meta[name="color-scheme"]');if(m)m.setAttribute('content',mc);d.classList.toggle('dark',dark);d.setAttribute(${JSON.stringify(APPEARANCE_ATTRIBUTES.preset)},p);d.setAttribute(${JSON.stringify(APPEARANCE_ATTRIBUTES.accent)},ac);d.setAttribute(${JSON.stringify(APPEARANCE_ATTRIBUTES.accentContrast)},acc);d.setAttribute(${JSON.stringify(APPEARANCE_ATTRIBUTES.contrast)},ct);d.setAttribute(${JSON.stringify(APPEARANCE_ATTRIBUTES.font)},fn);d.setAttribute(${JSON.stringify(APPEARANCE_ATTRIBUTES.fontSize)},fs);d.setAttribute(${JSON.stringify(APPEARANCE_ATTRIBUTES.docsFont)},df);d.setAttribute(${JSON.stringify(APPEARANCE_ATTRIBUTES.docsFontSize)},dfs);d.setAttribute(${JSON.stringify(APPEARANCE_ATTRIBUTES.docsLineHeight)},dlh);d.setAttribute(${JSON.stringify(APPEARANCE_ATTRIBUTES.docsImageScale)},dis);d.setAttribute(${JSON.stringify(APPEARANCE_ATTRIBUTES.docsCodeAccent)},dca);d.setAttribute(${JSON.stringify(APPEARANCE_ATTRIBUTES.docsInlineCodeAccent)},dica);d.setAttribute('data-code-palette',cp);}catch(e){}})();`;
}
