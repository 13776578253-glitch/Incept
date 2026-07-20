'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'incept-eye-comfort-filter';
const DATA_ATTRIBUTE = 'data-eye-comfort-filter';

function applyEyeComfortFilter(enabled: boolean) {
  document.documentElement.setAttribute(
    DATA_ATTRIBUTE,
    enabled ? 'warm' : 'off',
  );
}

export function useEyeComfortFilter() {
  const [enabled, setEnabled] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const storedValue = window.localStorage.getItem(STORAGE_KEY);
    const nextEnabled = storedValue === 'true';

    setEnabled(nextEnabled);
    applyEyeComfortFilter(nextEnabled);
    setIsReady(true);
  }, []);

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
