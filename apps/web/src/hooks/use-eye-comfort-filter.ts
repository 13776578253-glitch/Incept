'use client';

import { useAppearance } from '@/hooks/use-appearance';

export function useEyeComfortFilter() {
  const { preset, setPreset, isReady } = useAppearance();

  return {
    eyeComfortFilterEnabled: preset === 'warm-paper',
    setEyeComfortFilter: (nextEnabled: boolean) => {
      setPreset(nextEnabled ? 'warm-paper' : 'default');
    },
    isEyeComfortFilterReady: isReady,
  };
}
