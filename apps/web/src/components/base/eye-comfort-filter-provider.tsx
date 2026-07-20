'use client';

import { useEyeComfortFilter } from '@/hooks/use-eye-comfort-filter';

// Restores the saved preference before any route-specific settings UI is mounted.
export function EyeComfortFilterProvider() {
  useEyeComfortFilter();

  return null;
}
