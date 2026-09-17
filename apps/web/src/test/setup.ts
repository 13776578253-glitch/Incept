import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

function createMediaQueryList(query: string): MediaQueryList {
  const list = {
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  };

  return list as unknown as MediaQueryList;
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

window.matchMedia = ((query: string) => createMediaQueryList(query)) as typeof window.matchMedia;
