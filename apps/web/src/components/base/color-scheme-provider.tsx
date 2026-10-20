'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useMounted } from '@/hooks/use-mounted';

export type ColorScheme = 'light' | 'dark' | 'system';

type ColorSchemeContextValue = {
  colorScheme: ColorScheme;
  setColorScheme: (colorScheme: ColorScheme) => void;
};

const colorSchemeStorageKey = 'incept-color-scheme';
const ColorSchemeContext = createContext<ColorSchemeContextValue | null>(null);

function getStoredColorScheme(): ColorScheme {
  const stored = window.localStorage.getItem(colorSchemeStorageKey);

  return stored === 'light' || stored === 'dark' || stored === 'system'
    ? stored
    : 'system';
}

function applyColorScheme(colorScheme: ColorScheme) {
  const resolved =
    colorScheme === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : colorScheme;

  document.documentElement.classList.toggle('dark', resolved === 'dark');
  document.documentElement.style.colorScheme = resolved;
}

export function ColorSchemeProvider({ children }: { children: ReactNode }) {
  const mounted = useMounted();
  const [selection, setColorSchemeState] = useState<ColorScheme | null>(null);
  const colorScheme = selection ?? (mounted ? getStoredColorScheme() : 'system');

  useEffect(() => {
    if (!mounted) return;
    const systemMedia = window.matchMedia('(prefers-color-scheme: dark)');

    applyColorScheme(colorScheme);

    const handleSystemChange = () => {
      if (getStoredColorScheme() === 'system') {
        applyColorScheme('system');
      }
    };

    systemMedia.addEventListener('change', handleSystemChange);

    return () => systemMedia.removeEventListener('change', handleSystemChange);
  }, [colorScheme, mounted]);

  const setColorScheme = (nextColorScheme: ColorScheme) => {
    window.localStorage.setItem(colorSchemeStorageKey, nextColorScheme);
    document.cookie = `${colorSchemeStorageKey}=${nextColorScheme}; Path=/; SameSite=Lax; Max-Age=31536000`;
    setColorSchemeState(nextColorScheme);
    applyColorScheme(nextColorScheme);
  };

  return (
    <ColorSchemeContext.Provider value={{ colorScheme, setColorScheme }}>
      {children}
    </ColorSchemeContext.Provider>
  );
}

export function useColorSchemeContext() {
  const value = useContext(ColorSchemeContext);

  if (!value) {
    throw new Error('useColorScheme must be used within ColorSchemeProvider.');
  }

  return value;
}
