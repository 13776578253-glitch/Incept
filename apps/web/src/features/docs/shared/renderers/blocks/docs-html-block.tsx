'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { DocsHtmlBlockModel } from '@/features/docs/block-system';

const DEFAULT_HTML_BLOCK_HEIGHT = 380;
const MIN_HTML_BLOCK_HEIGHT = 120;
const MAX_HTML_BLOCK_HEIGHT = 1200;

export function DocsHtmlBlock({
  html,
  title,
  height,
  caption,
}: DocsHtmlBlockModel) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const resolvedHeight = Math.min(
    MAX_HTML_BLOCK_HEIGHT,
    Math.max(MIN_HTML_BLOCK_HEIGHT, Math.round(height ?? DEFAULT_HTML_BLOCK_HEIGHT)),
  );

  const postThemeSnapshot = useCallback(() => {
    const targetWindow = iframeRef.current?.contentWindow;
    if (!targetWindow || typeof document === 'undefined') {
      return;
    }

    const { theme = 'light', accent = 'neutral' } = document.documentElement.dataset;
    targetWindow.postMessage(
      {
        type: 'incept:theme',
        theme,
        accent,
      },
      '*',
    );
  }, []);

  useEffect(() => {
    if (typeof MutationObserver === 'undefined' || typeof document === 'undefined') {
      return;
    }

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (
          mutation.attributeName === 'data-theme' ||
          mutation.attributeName === 'data-accent'
        ) {
          postThemeSnapshot();
          break;
        }
      }
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'data-accent'],
    });

    return () => observer.disconnect();
  }, [postThemeSnapshot]);

  return (
    <figure className="w-full max-w-[var(--docs-prose-max-width)]">
      <div className="overflow-hidden rounded-[14px] border border-[color:var(--color-border-image)] bg-[var(--color-bg)]">
        <iframe
          ref={iframeRef}
          title={title ?? caption ?? 'Interactive HTML embed'}
          srcDoc={html}
          sandbox="allow-scripts"
          loading="lazy"
          referrerPolicy="no-referrer"
          style={{ height: `${resolvedHeight}px` }}
          className="block w-full border-0 bg-transparent"
          onLoad={postThemeSnapshot}
        />
      </div>
      {caption ? (
        <figcaption className="mt-3 text-[0.88rem] leading-6 text-[var(--color-text-soft)]">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}
