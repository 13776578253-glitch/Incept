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

export const UI_FONT_IDS = ['system', 'sans', 'geometric', 'humanist', 'serif', 'kai', 'mono'] as const;
export type UiFontId = (typeof UI_FONT_IDS)[number];

export const UI_FONT_SIZE_IDS = ['11', '12', '13', '14', '15', '16'] as const;
export type UiFontSizeId = (typeof UI_FONT_SIZE_IDS)[number];

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

export const APPEARANCE_STORAGE_KEYS = {
  preset: 'incept-theme-preset',
  colorScheme: 'incept-color-scheme',
  accent: 'incept-accent',
  contrast: 'incept-contrast',
  font: 'incept-font',
  fontSize: 'incept-font-size',
  legacyEyeComfort: 'incept-eye-comfort-filter',
} as const;

export const APPEARANCE_ATTRIBUTES = {
  preset: 'data-theme-preset',
  accent: 'data-accent',
  contrast: 'data-contrast',
  font: 'data-font',
  fontSize: 'data-font-size',
} as const;

export const APPEARANCE_COOKIES = {
  preset: 'incept-theme-preset',
  colorScheme: 'incept-color-scheme',
  accent: 'incept-accent',
  contrast: 'incept-contrast',
  font: 'incept-font',
  fontSize: 'incept-font-size',
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

export function isUiFont(value: string | null | undefined): value is UiFontId {
  return value !== null && value !== undefined && UI_FONT_IDS.includes(value as UiFontId);
}

export function isUiFontSize(value: string | null | undefined): value is UiFontSizeId {
  return value !== null && value !== undefined && UI_FONT_SIZE_IDS.includes(value as UiFontSizeId);
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
  return `(function(){try{var d=document.documentElement,ls=window.localStorage,p=ls.getItem(${JSON.stringify(APPEARANCE_STORAGE_KEYS.preset)}),leg=ls.getItem(${JSON.stringify(APPEARANCE_STORAGE_KEYS.legacyEyeComfort)}),sc=ls.getItem(${JSON.stringify(APPEARANCE_STORAGE_KEYS.colorScheme)}),ac=ls.getItem(${JSON.stringify(APPEARANCE_STORAGE_KEYS.accent)}),ct=ls.getItem(${JSON.stringify(APPEARANCE_STORAGE_KEYS.contrast)}),fn=ls.getItem(${JSON.stringify(APPEARANCE_STORAGE_KEYS.font)}),fs=ls.getItem(${JSON.stringify(APPEARANCE_STORAGE_KEYS.fontSize)}),cp=ls.getItem('incept-code-palette');var vp=${JSON.stringify(THEME_PRESET_IDS)},va=${JSON.stringify(ACCENT_PRESET_IDS)},vc=${JSON.stringify(CONTRAST_MODE_IDS)},vf=${JSON.stringify(UI_FONT_IDS)},vs=${JSON.stringify(UI_FONT_SIZE_IDS)},vcp=['auto','vscode','github','vitesse'];if(vp.indexOf(p)===-1){p=leg==='true'?'warm-paper':'default';if(leg==='true'){ls.setItem(${JSON.stringify(APPEARANCE_STORAGE_KEYS.preset)},'warm-paper');ls.removeItem(${JSON.stringify(APPEARANCE_STORAGE_KEYS.legacyEyeComfort)});}}if(sc!=='light'&&sc!=='dark'&&sc!=='system'){sc='system';}if(va.indexOf(ac)===-1)ac='theme';if(vc.indexOf(ct)===-1)ct='default';if(vf.indexOf(fn)===-1)fn='system';if(vs.indexOf(fs)===-1)fs='14';if(vcp.indexOf(cp)===-1)cp='auto';var sys=window.matchMedia('(prefers-color-scheme: dark)').matches;var dark=(p==='catppuccin-mocha'||p==='rose-pine')?true:(p==='warm-paper'||p==='catppuccin-latte'||p==='rose-pine-dawn')?false:(sc==='dark'||(sc==='system'&&sys));var mc=(p==='default'&&sc==='system')?'light dark':(dark?'dark':'light');var m=document.querySelector('meta[name="color-scheme"]');if(m)m.setAttribute('content',mc);d.classList.toggle('dark',dark);d.setAttribute(${JSON.stringify(APPEARANCE_ATTRIBUTES.preset)},p);d.setAttribute(${JSON.stringify(APPEARANCE_ATTRIBUTES.accent)},ac);d.setAttribute(${JSON.stringify(APPEARANCE_ATTRIBUTES.contrast)},ct);d.setAttribute(${JSON.stringify(APPEARANCE_ATTRIBUTES.font)},fn);d.setAttribute(${JSON.stringify(APPEARANCE_ATTRIBUTES.fontSize)},fs);d.setAttribute('data-code-palette',cp);}catch(e){}})();`;
}
