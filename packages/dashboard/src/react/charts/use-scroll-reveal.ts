'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * Temporarily marks a `.dashboard-subtle-scrollbar` element with `data-scrolling="true"`
 * while scrolled so silent scrollbars appear only during active scroll or hover.
 */
export function useScrollReveal() {
  const timerRef = useRef<number | null>(null);
  const targetRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null && typeof window !== 'undefined') {
        window.clearTimeout(timerRef.current);
      }
      if (targetRef.current) {
        delete targetRef.current.dataset.scrolling;
      }
    };
  }, []);

  return useCallback((event: React.UIEvent<HTMLElement>) => {
    const el = event.currentTarget;
    targetRef.current = el;
    el.dataset.scrolling = 'true';
    if (typeof window === 'undefined') return;
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      delete el.dataset.scrolling;
      timerRef.current = null;
    }, 900);
  }, []);
}
