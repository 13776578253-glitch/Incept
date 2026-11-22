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
  isAccentPreset,
  isColorScheme,
  isContrastMode,
  isUiFont,
  isUiFontSize,
  migrateLegacyEyeComfort,
  resolveThemePolarity,
  type AccentPresetId,
  type ColorScheme,
  type ContrastMode,
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
  contrast: ContrastMode;
  font: UiFontId;
  fontSize: UiFontSizeId;
  isReady: boolean;
};

export type AppearanceContextValue = AppearanceState & {
  setPreset: (preset: ThemePresetId) => void;
  setColorScheme: (colorScheme: ColorScheme) => void;
  setThemeMode: (colorScheme: ColorScheme) => void;
  setAccent: (accent: AccentPresetId) => void;
  setContrast: (contrast: ContrastMode) => void;
  setFont: (font: UiFontId) => void;
  setFontSize: (fontSize: UiFontSizeId) => void;
  toggleSmartTheme: () => void;
};

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

type StoredAppearance = {
  preset: ThemePresetId;
  colorScheme: ColorScheme;
  accent: AccentPresetId;
  contrast: ContrastMode;
  font: UiFontId;
  fontSize: UiFontSizeId;
};

const DEFAULT_APPEARANCE: StoredAppearance = {
  preset: 'default',
  colorScheme: 'system',
  accent: 'theme',
  contrast: 'default',
  font: 'system',
  fontSize: '14',
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
    const storedContrast = ls.getItem(APPEARANCE_STORAGE_KEYS.contrast);
    const storedFont = ls.getItem(APPEARANCE_STORAGE_KEYS.font);
    const storedFontSize = ls.getItem(APPEARANCE_STORAGE_KEYS.fontSize);

    return {
      preset,
      colorScheme: isColorScheme(storedScheme) ? storedScheme : 'system',
      accent: isAccentPreset(storedAccent) ? storedAccent : 'theme',
      contrast: isContrastMode(storedContrast) ? storedContrast : 'default',
      font: isUiFont(storedFont) ? storedFont : 'system',
      fontSize: isUiFontSize(storedFontSize) ? storedFontSize : '14',
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
  root.setAttribute(APPEARANCE_ATTRIBUTES.contrast, state.contrast);
  root.setAttribute(APPEARANCE_ATTRIBUTES.font, state.font);
  root.setAttribute(APPEARANCE_ATTRIBUTES.fontSize, state.fontSize);

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
    [APPEARANCE_COOKIES.contrast, state.contrast],
    [APPEARANCE_COOKIES.font, state.font],
    [APPEARANCE_COOKIES.fontSize, state.fontSize],
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
      contrast: overrides.contrast ?? stored.contrast,
      font: overrides.font ?? stored.font,
      fontSize: overrides.fontSize ?? stored.fontSize,
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
      setContrast,
      setFont,
      setFontSize,
      toggleSmartTheme,
    }),
    [
      current,
      isReady,
      resolvedPolarity,
      setAccent,
      setColorScheme,
      setContrast,
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
