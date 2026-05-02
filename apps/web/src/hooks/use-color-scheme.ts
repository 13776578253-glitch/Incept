'use client';

import { useTheme } from 'next-themes';

export function useColorScheme() {
  const { theme, setTheme } = useTheme();

  return {
    colorScheme: (theme ?? 'system') as 'light' | 'dark' | 'system',
    setColorScheme: setTheme,
  };
}
