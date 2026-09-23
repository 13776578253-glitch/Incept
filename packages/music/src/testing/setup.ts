// 共享测试环境缺口（jsdom 未实现的部分）：jest-dom 匹配器、渲染清理、localStorage、matchMedia
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
  // @vitest-environment node 的服务端测试没有 DOM，没有需要清理的渲染与存储
  if (typeof window === 'undefined') return;

  cleanup();
  localStorage.clear();
});

if (typeof window !== 'undefined') {
  window.matchMedia = ((query: string) => createMediaQueryList(query)) as typeof window.matchMedia;
}
