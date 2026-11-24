'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  APPEARANCE_ATTRIBUTES,
  APPEARANCE_COOKIES,
  APPEARANCE_STORAGE_KEYS,
  getColorSchemeMetaContent,
  getSmartToggleTarget,
  isAccentContrastMode,
  isAccentPreset,
  isColorScheme,
  isContrastMode,
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
  type AccentContrastMode,
  type AccentPresetId,
  type ColorScheme,
  type ContrastMode,
  type DocsCodeAccentId,
  type DocsFontId,
  type DocsFontSizeId,
  type DocsImageScaleId,
  type DocsInlineCodeAccentId,
  type DocsLineHeightId,
  type ResolvedPolarity,
  type ThemePresetId,
  type UiFontId,
  type UiFontSizeId,
} from '@incept/ui';
import { useMounted } from '@/hooks/use-mounted';

export type AppearanceState = {
  preset: ThemePresetId;
  colorScheme: ColorScheme;
  resolvedPolarity: ResolvedPolarity;
  accent: AccentPresetId;
  accentContrast: AccentContrastMode;
  contrast: ContrastMode;
  font: UiFontId;
  fontSize: UiFontSizeId;
  docsFont: DocsFontId;
  docsFontSize: DocsFontSizeId;
  docsLineHeight: DocsLineHeightId;
  docsImageScale: DocsImageScaleId;
  docsCodeAccent: DocsCodeAccentId;
  docsInlineCodeAccent: DocsInlineCodeAccentId;
  isReady: boolean;
};

export type AppearanceContextValue = AppearanceState & {
  setPreset: (preset: ThemePresetId) => void;
  setColorScheme: (colorScheme: ColorScheme) => void;
  setThemeMode: (colorScheme: ColorScheme) => void;
  setAccent: (accent: AccentPresetId) => void;
  setAccentContrast: (accentContrast: AccentContrastMode) => void;
  setContrast: (contrast: ContrastMode) => void;
  setFont: (font: UiFontId) => void;
  setFontSize: (fontSize: UiFontSizeId) => void;
  setDocsFont: (docsFont: DocsFontId) => void;
  setDocsFontSize: (docsFontSize: DocsFontSizeId) => void;
  setDocsLineHeight: (docsLineHeight: DocsLineHeightId) => void;
  setDocsImageScale: (docsImageScale: DocsImageScaleId) => void;
  setDocsCodeAccent: (docsCodeAccent: DocsCodeAccentId) => void;
  setDocsInlineCodeAccent: (docsInlineCodeAccent: DocsInlineCodeAccentId) => void;
  toggleSmartTheme: () => void;
};

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

type StoredAppearance = {
  preset: ThemePresetId;
  colorScheme: ColorScheme;
  accent: AccentPresetId;
  accentContrast: AccentContrastMode;
  contrast: ContrastMode;
  font: UiFontId;
  fontSize: UiFontSizeId;
  docsFont: DocsFontId;
  docsFontSize: DocsFontSizeId;
  docsLineHeight: DocsLineHeightId;
  docsImageScale: DocsImageScaleId;
  docsCodeAccent: DocsCodeAccentId;
  docsInlineCodeAccent: DocsInlineCodeAccentId;
};

const DEFAULT_APPEARANCE: StoredAppearance = {
  preset: 'default',
  colorScheme: 'system',
  accent: 'theme',
  accentContrast: 'default',
  contrast: 'default',
  font: 'system',
  fontSize: '14',
  docsFont: 'inherit',
  docsFontSize: 'inherit',
  docsLineHeight: 'comfortable',
  docsImageScale: '90',
  docsCodeAccent: 'inherit',
  docsInlineCodeAccent: 'inherit',
};

function readStoredAppearance(): StoredAppearance {
  try {
    const ls = window.localStorage;
    const preset = migrateLegacyEyeComfort(
      ls.getItem(APPEARANCE_STORAGE_KEYS.preset),
      ls.getItem(APPEARANCE_STORAGE_KEYS.legacyEyeComfort),
    );
    const storedScheme = ls.getItem(APPEARANCE_STORAGE_KEYS.colorScheme);
    const storedAccent = ls.getItem(APPEARANCE_STORAGE_KEYS.accent);
    const storedAccentContrast = ls.getItem(APPEARANCE_STORAGE_KEYS.accentContrast);
    const storedContrast = ls.getItem(APPEARANCE_STORAGE_KEYS.contrast);
    const storedFont = ls.getItem(APPEARANCE_STORAGE_KEYS.font);
    const storedFontSize = ls.getItem(APPEARANCE_STORAGE_KEYS.fontSize);
    const storedDocsFont = ls.getItem(APPEARANCE_STORAGE_KEYS.docsFont);
    const storedDocsFontSize = ls.getItem(APPEARANCE_STORAGE_KEYS.docsFontSize);
    const storedDocsLineHeight = ls.getItem(APPEARANCE_STORAGE_KEYS.docsLineHeight);
    const storedDocsImageScale = ls.getItem(APPEARANCE_STORAGE_KEYS.docsImageScale);
    const storedDocsCodeAccent = ls.getItem(APPEARANCE_STORAGE_KEYS.docsCodeAccent);
    const storedDocsInlineCodeAccent = ls.getItem(APPEARANCE_STORAGE_KEYS.docsInlineCodeAccent);

    return {
      preset,
      colorScheme: isColorScheme(storedScheme) ? storedScheme : 'system',
      accent: isAccentPreset(storedAccent) ? storedAccent : 'theme',
      accentContrast: isAccentContrastMode(storedAccentContrast) ? storedAccentContrast : 'default',
      contrast: isContrastMode(storedContrast) ? storedContrast : 'default',
      font: isUiFont(storedFont) ? storedFont : 'system',
      fontSize: isUiFontSize(storedFontSize) ? storedFontSize : '14',
      docsFont: isDocsFont(storedDocsFont) ? storedDocsFont : 'inherit',
      docsFontSize: isDocsFontSize(storedDocsFontSize) ? storedDocsFontSize : 'inherit',
      docsLineHeight: isDocsLineHeight(storedDocsLineHeight) ? storedDocsLineHeight : 'comfortable',
      docsImageScale: isDocsImageScale(storedDocsImageScale) ? storedDocsImageScale : '90',
      docsCodeAccent: isDocsCodeAccent(storedDocsCodeAccent) ? storedDocsCodeAccent : 'inherit',
      docsInlineCodeAccent: isDocsInlineCodeAccent(storedDocsInlineCodeAccent) ? storedDocsInlineCodeAccent : 'inherit',
    };
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

function subscribeSystemDark(callback: () => void) {
  if (typeof window === 'undefined') {
    return () => {};
  }
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  media.addEventListener('change', callback);
  return () => media.removeEventListener('change', callback);
}

function getSystemDarkSnapshot() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyAppearanceToDom(state: StoredAppearance, systemPrefersDark: boolean) {
  const root = document.documentElement;
  const resolved = resolveThemePolarity(state.preset, state.colorScheme, systemPrefersDark);
  const metaContent = getColorSchemeMetaContent(state.preset, state.colorScheme);

  root.classList.toggle('dark', resolved === 'dark');
  root.setAttribute(APPEARANCE_ATTRIBUTES.preset, state.preset);
  root.setAttribute(APPEARANCE_ATTRIBUTES.accent, state.accent);
  root.setAttribute(APPEARANCE_ATTRIBUTES.accentContrast, state.accentContrast);
  root.setAttribute(APPEARANCE_ATTRIBUTES.contrast, state.contrast);
  root.setAttribute(APPEARANCE_ATTRIBUTES.font, state.font);
  root.setAttribute(APPEARANCE_ATTRIBUTES.fontSize, state.fontSize);
  root.setAttribute(APPEARANCE_ATTRIBUTES.docsFont, state.docsFont);
  root.setAttribute(APPEARANCE_ATTRIBUTES.docsFontSize, state.docsFontSize);
  root.setAttribute(APPEARANCE_ATTRIBUTES.docsLineHeight, state.docsLineHeight);
  root.setAttribute(APPEARANCE_ATTRIBUTES.docsImageScale, state.docsImageScale);
  root.setAttribute(APPEARANCE_ATTRIBUTES.docsCodeAccent, state.docsCodeAccent);
  root.setAttribute(APPEARANCE_ATTRIBUTES.docsInlineCodeAccent, state.docsInlineCodeAccent);

  const meta = document.querySelector('meta[name="color-scheme"]');
  if (meta) {
    meta.setAttribute('content', metaContent);
  }
}

function persistValue(key: string, value: string | null, cookieName?: string) {
  try {
    if (value === null) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // Ignore storage failures in restricted contexts
  }

  if (cookieName && typeof document !== 'undefined') {
    const cookieVal = encodeURIComponent(value ?? 'system');
    document.cookie = `${cookieName}=${cookieVal}; Path=/; SameSite=Lax; Max-Age=31536000`;
  }
}

function syncAppearanceCookies(state: StoredAppearance) {
  if (typeof document === 'undefined') return;
  const entries: ReadonlyArray<[string, string]> = [
    [APPEARANCE_COOKIES.preset, state.preset],
    [APPEARANCE_COOKIES.colorScheme, state.colorScheme],
    [APPEARANCE_COOKIES.accent, state.accent],
    [APPEARANCE_COOKIES.accentContrast, state.accentContrast],
    [APPEARANCE_COOKIES.contrast, state.contrast],
    [APPEARANCE_COOKIES.font, state.font],
    [APPEARANCE_COOKIES.fontSize, state.fontSize],
    [APPEARANCE_COOKIES.docsFont, state.docsFont],
    [APPEARANCE_COOKIES.docsFontSize, state.docsFontSize],
    [APPEARANCE_COOKIES.docsLineHeight, state.docsLineHeight],
    [APPEARANCE_COOKIES.docsImageScale, state.docsImageScale],
    [APPEARANCE_COOKIES.docsCodeAccent, state.docsCodeAccent],
    [APPEARANCE_COOKIES.docsInlineCodeAccent, state.docsInlineCodeAccent],
  ];
  for (const [cookieName, cookieValue] of entries) {
    document.cookie = `${cookieName}=${encodeURIComponent(cookieValue)}; Path=/; SameSite=Lax; Max-Age=31536000`;
  }
}

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const isReady = useMounted();
  const systemPrefersDark = useSyncExternalStore(
    subscribeSystemDark,
    getSystemDarkSnapshot,
    () => false,
  );
  const [overrides, setOverrides] = useState<Partial<StoredAppearance>>({});

  const stored = useMemo(
    () => (isReady ? readStoredAppearance() : DEFAULT_APPEARANCE),
    [isReady],
  );

  const current: StoredAppearance = useMemo(
    () => ({
      preset: overrides.preset ?? stored.preset,
      colorScheme: overrides.colorScheme ?? stored.colorScheme,
      accent: overrides.accent ?? stored.accent,
      accentContrast: overrides.accentContrast ?? stored.accentContrast,
      contrast: overrides.contrast ?? stored.contrast,
      font: overrides.font ?? stored.font,
      fontSize: overrides.fontSize ?? stored.fontSize,
      docsFont: overrides.docsFont ?? stored.docsFont,
      docsFontSize: overrides.docsFontSize ?? stored.docsFontSize,
      docsLineHeight: overrides.docsLineHeight ?? stored.docsLineHeight,
      docsImageScale: overrides.docsImageScale ?? stored.docsImageScale,
      docsCodeAccent: overrides.docsCodeAccent ?? stored.docsCodeAccent,
      docsInlineCodeAccent: overrides.docsInlineCodeAccent ?? stored.docsInlineCodeAccent,
    }),
    [overrides, stored],
  );

  useEffect(() => {
    if (!isReady) return;
    applyAppearanceToDom(current, systemPrefersDark);
    syncAppearanceCookies(current);
  }, [current, isReady, systemPrefersDark]);

  useEffect(() => {
    if (!isReady) return;

    const handleStorage = (event: StorageEvent) => {
      if (!event.key || Object.values(APPEARANCE_STORAGE_KEYS).includes(event.key as never)) {
        setOverrides(readStoredAppearance());
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [isReady]);

  const setPreset = useCallback((preset: ThemePresetId) => {
    persistValue(APPEARANCE_STORAGE_KEYS.preset, preset, APPEARANCE_COOKIES.preset);
    try {
      window.localStorage.removeItem(APPEARANCE_STORAGE_KEYS.legacyEyeComfort);
    } catch {
      // Ignore
    }
    setOverrides((prev) => ({ ...prev, preset }));
  }, []);

  const setColorScheme = useCallback((colorScheme: ColorScheme) => {
    persistValue(
      APPEARANCE_STORAGE_KEYS.colorScheme,
      colorScheme === 'system' ? null : colorScheme,
      APPEARANCE_COOKIES.colorScheme,
    );
    setOverrides((prev) => ({ ...prev, colorScheme }));
  }, []);

  const setThemeMode = useCallback((colorScheme: ColorScheme) => {
    persistValue(
      APPEARANCE_STORAGE_KEYS.colorScheme,
      colorScheme === 'system' ? null : colorScheme,
      APPEARANCE_COOKIES.colorScheme,
    );
    persistValue(APPEARANCE_STORAGE_KEYS.preset, 'default', APPEARANCE_COOKIES.preset);
    setOverrides((prev) => ({ ...prev, preset: 'default', colorScheme }));
  }, []);

  const setAccent = useCallback((accent: AccentPresetId) => {
    persistValue(APPEARANCE_STORAGE_KEYS.accent, accent, APPEARANCE_COOKIES.accent);
    setOverrides((prev) => ({ ...prev, accent }));
  }, []);

  const setAccentContrast = useCallback((accentContrast: AccentContrastMode) => {
    persistValue(APPEARANCE_STORAGE_KEYS.accentContrast, accentContrast, APPEARANCE_COOKIES.accentContrast);
    setOverrides((prev) => ({ ...prev, accentContrast }));
  }, []);

  const setContrast = useCallback((contrast: ContrastMode) => {
    persistValue(APPEARANCE_STORAGE_KEYS.contrast, contrast, APPEARANCE_COOKIES.contrast);
    setOverrides((prev) => ({ ...prev, contrast }));
  }, []);

  const setFont = useCallback((font: UiFontId) => {
    persistValue(APPEARANCE_STORAGE_KEYS.font, font, APPEARANCE_COOKIES.font);
    setOverrides((prev) => ({ ...prev, font }));
  }, []);

  const setFontSize = useCallback((fontSize: UiFontSizeId) => {
    persistValue(APPEARANCE_STORAGE_KEYS.fontSize, fontSize, APPEARANCE_COOKIES.fontSize);
    setOverrides((prev) => ({ ...prev, fontSize }));
  }, []);

  const setDocsFont = useCallback((docsFont: DocsFontId) => {
    persistValue(APPEARANCE_STORAGE_KEYS.docsFont, docsFont, APPEARANCE_COOKIES.docsFont);
    setOverrides((prev) => ({ ...prev, docsFont }));
  }, []);

  const setDocsFontSize = useCallback((docsFontSize: DocsFontSizeId) => {
    persistValue(APPEARANCE_STORAGE_KEYS.docsFontSize, docsFontSize, APPEARANCE_COOKIES.docsFontSize);
    setOverrides((prev) => ({ ...prev, docsFontSize }));
  }, []);

  const setDocsLineHeight = useCallback((docsLineHeight: DocsLineHeightId) => {
    persistValue(APPEARANCE_STORAGE_KEYS.docsLineHeight, docsLineHeight, APPEARANCE_COOKIES.docsLineHeight);
    setOverrides((prev) => ({ ...prev, docsLineHeight }));
  }, []);

  const setDocsImageScale = useCallback((docsImageScale: DocsImageScaleId) => {
    persistValue(APPEARANCE_STORAGE_KEYS.docsImageScale, docsImageScale, APPEARANCE_COOKIES.docsImageScale);
    setOverrides((prev) => ({ ...prev, docsImageScale }));
  }, []);

  const setDocsCodeAccent = useCallback((docsCodeAccent: DocsCodeAccentId) => {
    persistValue(APPEARANCE_STORAGE_KEYS.docsCodeAccent, docsCodeAccent, APPEARANCE_COOKIES.docsCodeAccent);
    setOverrides((prev) => ({ ...prev, docsCodeAccent }));
  }, []);

  const setDocsInlineCodeAccent = useCallback((docsInlineCodeAccent: DocsInlineCodeAccentId) => {
    persistValue(APPEARANCE_STORAGE_KEYS.docsInlineCodeAccent, docsInlineCodeAccent, APPEARANCE_COOKIES.docsInlineCodeAccent);
    setOverrides((prev) => ({ ...prev, docsInlineCodeAccent }));
  }, []);

  const toggleSmartTheme = useCallback(() => {
    const next = getSmartToggleTarget(current.preset, current.colorScheme, systemPrefersDark);
    persistValue(APPEARANCE_STORAGE_KEYS.preset, next.preset, APPEARANCE_COOKIES.preset);
    persistValue(
      APPEARANCE_STORAGE_KEYS.colorScheme,
      next.colorScheme === 'system' ? null : next.colorScheme,
      APPEARANCE_COOKIES.colorScheme,
    );
    setOverrides((prev) => ({ ...prev, preset: next.preset, colorScheme: next.colorScheme }));
  }, [current.colorScheme, current.preset, systemPrefersDark]);

  const resolvedPolarity = resolveThemePolarity(
    current.preset,
    current.colorScheme,
    systemPrefersDark,
  );

  const value = useMemo<AppearanceContextValue>(
    () => ({
      ...current,
      resolvedPolarity,
      isReady,
      setPreset,
      setColorScheme,
      setThemeMode,
      setAccent,
      setAccentContrast,
      setContrast,
      setFont,
      setFontSize,
      setDocsFont,
      setDocsFontSize,
      setDocsLineHeight,
      setDocsImageScale,
      setDocsCodeAccent,
      setDocsInlineCodeAccent,
      toggleSmartTheme,
    }),
    [
      current,
      isReady,
      resolvedPolarity,
      setAccent,
      setAccentContrast,
      setColorScheme,
      setContrast,
      setDocsCodeAccent,
      setDocsFont,
      setDocsFontSize,
      setDocsImageScale,
      setDocsInlineCodeAccent,
      setDocsLineHeight,
      setFont,
      setFontSize,
      setPreset,
      setThemeMode,
      toggleSmartTheme,
    ],
  );

  return (
    <AppearanceContext.Provider value={value}>
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearanceContext(): AppearanceContextValue {
  const value = useContext(AppearanceContext);
  if (!value) {
    throw new Error('useAppearance must be used within AppearanceProvider.');
  }
  return value;
}
