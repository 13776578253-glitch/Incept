'use client';

import { useEffect } from 'react';

/**
 * ScrollbarController
 * Manages auto-hide interaction states for ChatGPT-style overlay scrollbars.
 * Detects active scrolling, near-edge mouse proximity, and thumb drag interactions.
 */
export function ScrollbarController() {
  useEffect(() => {
    let scrollTimer: ReturnType<typeof setTimeout> | null = null;
    let isDragging = false;

    const showScrollbar = () => {
      document.documentElement.dataset.scrolling = 'true';
      if (scrollTimer) {
        clearTimeout(scrollTimer);
      }
      scrollTimer = setTimeout(() => {
        if (!isDragging) {
          delete document.documentElement.dataset.scrolling;
        }
      }, 1000);
    };

    const handleMouseMove = (e: MouseEvent) => {
      // Reveal scrollbar when mouse cursor moves near the right viewport edge (within 24px)
      const isNearRightEdge = window.innerWidth - e.clientX <= 24;
      if (isNearRightEdge) {
        document.documentElement.dataset.scrollbarHover = 'true';
      } else if (document.documentElement.dataset.scrollbarHover) {
        delete document.documentElement.dataset.scrollbarHover;
      }
    };

    const handleMouseLeave = () => {
      delete document.documentElement.dataset.scrollbarHover;
    };

    const handlePointerDown = (e: PointerEvent) => {
      // If user clicks near the right edge, they might be dragging the scrollbar
      if (window.innerWidth - e.clientX <= 24) {
        isDragging = true;
        document.documentElement.dataset.scrolling = 'true';
      }
    };

    const handlePointerUp = () => {
      if (isDragging) {
        isDragging = false;
        if (scrollTimer) {
          clearTimeout(scrollTimer);
        }
        scrollTimer = setTimeout(() => {
          delete document.documentElement.dataset.scrolling;
        }, 1000);
      }
    };

    window.addEventListener('scroll', showScrollbar, { passive: true, capture: true });
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    document.addEventListener('mouseleave', handleMouseLeave);
    window.addEventListener('pointerdown', handlePointerDown, { passive: true });
    window.addEventListener('pointerup', handlePointerUp, { passive: true });

    return () => {
      if (scrollTimer) {
        clearTimeout(scrollTimer);
      }
      window.removeEventListener('scroll', showScrollbar, true);
      window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseleave', handleMouseLeave);
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointerup', handlePointerUp);
      delete document.documentElement.dataset.scrolling;
      delete document.documentElement.dataset.scrollbarHover;
    };
  }, []);

  return null;
}
