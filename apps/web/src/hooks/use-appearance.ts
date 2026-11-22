'use client';

import { useAppearanceContext } from '@/components/base/appearance-provider';

export function useAppearance() {
  return useAppearanceContext();
}
