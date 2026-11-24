'use client';

import { useTranslations } from 'next-intl';

type DocsHomeCurationToggleProps = {
  curatedOnly: boolean;
  onToggle: () => void;
};

export function DocsHomeCurationToggle({
  curatedOnly,
  onToggle,
}: DocsHomeCurationToggleProps) {
  const t = useTranslations('docs.home.curation');

  return (
    <div className="inline-flex max-w-full items-center gap-1.5 select-none">
      <button
        type="button"
        aria-pressed={curatedOnly}
        aria-label={curatedOnly ? t('toggleAriaCurated') : t('toggleAriaAll')}
        onClick={onToggle}
        className="group relative inline-flex h-[34px] shrink-0 -rotate-[1.8deg] cursor-pointer items-center gap-1.5 rounded-[10px] bg-[var(--color-surface-card)] px-2.5 text-[length:var(--text-xs)] font-medium text-[var(--color-text)] transition-transform duration-150 hover:rotate-0 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring-focus)]"
      >
        {/* Hand-drawn wobbly border */}
        <svg
          aria-hidden="true"
          viewBox="0 0 120 38"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
          fill="none"
        >
          <path
            d="M7 3.5 C34 1.8, 84 2.2, 113 4.2 C117.5 4.8, 118.2 12, 117.8 19.5 C117.4 28.5, 116.5 34.4, 110.5 34.8 C78 36.2, 32 35.6, 8.5 34.5 C3 34.1, 2.2 27, 2.6 18.5 C2.9 10, 3.2 4.1, 7 3.5 Z"
            stroke={curatedOnly ? 'var(--color-accent)' : 'var(--color-border-strong, var(--color-border))'}
            strokeWidth="1.65"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={curatedOnly ? undefined : '4 2.5'}
          />
        </svg>

        {/* Small sketchy star/doodle mark */}
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className="size-3 shrink-0"
          fill="none"
          stroke={curatedOnly ? 'var(--color-accent)' : 'var(--color-nav-muted)'}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {curatedOnly ? (
            <path d="M8 1.8 L9.4 6.1 L13.8 7.5 L9.4 9 L8 13.6 L6.5 9 L2.2 7.5 L6.5 6.1 Z" />
          ) : (
            <path d="M3 5.2 Q8 4.4 13 5.4 M2.8 8.3 Q8 7.6 13.2 8.4 M3.4 11.4 Q8 10.8 12.6 11.5" />
          )}
        </svg>

        <span className="relative whitespace-nowrap leading-none">
          {curatedOnly ? t('curatedLabel') : t('allLabel')}
        </span>
      </button>

      {/* Handwritten annotation floating above-right + curved arrow sweeping to its centroid */}
      <div
        aria-hidden="true"
        className="pointer-events-none hidden -translate-y-[8px] flex-col items-start lg:flex"
      >
        <span
          className="ml-1.5 whitespace-nowrap -rotate-[1.8deg] text-[11.5px] leading-tight italic text-[var(--color-text-muted)]"
          style={{
            fontFamily:
              "'Segoe Script', 'KaiTi', 'STKaiti', Georgia, serif",
          }}
        >
          {curatedOnly ? t('curatedHint') : t('allHint')}
        </span>
        <svg
          viewBox="0 0 64 20"
          className="-mt-0.5 h-5 w-[64px] shrink-0 text-[var(--color-text-muted)]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.45"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2 16 C22 17, 42 13, 56 3" />
          <path d="M50.2 3.8 L56.8 2.4 L54.6 8.6" />
        </svg>
      </div>
    </div>
  );
}
