'use client';

import { useEffect, useState } from 'react';
import { useMounted } from './use-mounted';

const STORAGE_KEY = 'incept-eye-comfort-filter';
const DATA_ATTRIBUTE = 'data-eye-comfort-filter';

function applyEyeComfortFilter(enabled: boolean) {
  document.documentElement.setAttribute(
    DATA_ATTRIBUTE,
    enabled ? 'warm' : 'off',
  );
}

export function useEyeComfortFilter() {
  const isReady = useMounted();
  const [selection, setEnabled] = useState<boolean | null>(null);
  const enabled = selection ?? (isReady && window.localStorage.getItem(STORAGE_KEY) === 'true');

  useEffect(() => {
    if (isReady) applyEyeComfortFilter(enabled);
  }, [enabled, isReady]);

  const setEyeComfortFilter = (nextEnabled: boolean) => {
    setEnabled(nextEnabled);
    window.localStorage.setItem(STORAGE_KEY, String(nextEnabled));
    applyEyeComfortFilter(nextEnabled);
  };

  return {
    eyeComfortFilterEnabled: enabled,
    setEyeComfortFilter,
    isEyeComfortFilterReady: isReady,
  };
}
