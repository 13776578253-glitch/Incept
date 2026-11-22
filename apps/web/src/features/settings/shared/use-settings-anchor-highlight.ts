'use client';

import { useEffect, useRef } from 'react';
import { SETTINGS_NAVIGATE_EVENT, type SettingsNavigateDetail } from './settings-search-index';

export function useSettingsAnchorHighlight(activeSectionId: string) {
  const pendingAnchorRef = useRef<{ anchorId: string; sectionId: string } | null>(null);
  const cleanupTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const highlightTarget = (anchorId: string) => {
      let attempts = 0;

      const tryLocate = () => {
        const target = document.getElementById(anchorId);
        if (target) {
          if (typeof target.scrollIntoView === 'function') {
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
          target.removeAttribute('data-settings-highlight');
          void target.offsetWidth;
          target.setAttribute('data-settings-highlight', 'true');
          if (cleanupTimerRef.current !== null) {
            window.clearTimeout(cleanupTimerRef.current);
          }
          cleanupTimerRef.current = window.setTimeout(() => {
            target.removeAttribute('data-settings-highlight');
          }, 1600);
          pendingAnchorRef.current = null;
          return;
        }

        if (attempts < 10) {
          attempts += 1;
          window.setTimeout(tryLocate, 45);
        }
      };

      window.requestAnimationFrame(tryLocate);
    };

    const handleNavigate = (event: Event) => {
      const detail = (event as CustomEvent<SettingsNavigateDetail>).detail;
      if (!detail?.anchorId) {
        return;
      }
      pendingAnchorRef.current = { anchorId: detail.anchorId, sectionId: detail.sectionId };
      if (detail.sectionId === activeSectionId) {
        highlightTarget(detail.anchorId);
      }
    };

    window.addEventListener(SETTINGS_NAVIGATE_EVENT, handleNavigate);
    if (pendingAnchorRef.current && pendingAnchorRef.current.sectionId === activeSectionId) {
      highlightTarget(pendingAnchorRef.current.anchorId);
    }

    return () => {
      window.removeEventListener(SETTINGS_NAVIGATE_EVENT, handleNavigate);
    };
  }, [activeSectionId]);
}
