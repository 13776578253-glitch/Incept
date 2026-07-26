'use client';

import { useColorSchemeContext } from '@/components/base/color-scheme-provider';

export function useColorScheme() {
  return useColorSchemeContext();
}
