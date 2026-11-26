'use client';

import type { ReactNode } from 'react';
import { type ColorScheme } from '@incept/ui';
import {
  AppearanceProvider,
  useAppearanceContext,
} from '@/components/base/appearance-provider';

export type { ColorScheme };

export function ColorSchemeProvider({ children }: { children: ReactNode }) {
  return <AppearanceProvider>{children}</AppearanceProvider>;
}

export function useColorSchemeContext() {
  const { colorScheme, setColorScheme } = useAppearanceContext();
  return { colorScheme, setColorScheme };
}
