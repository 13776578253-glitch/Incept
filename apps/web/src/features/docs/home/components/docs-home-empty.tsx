'use client';

import { useTranslations } from 'next-intl';

type DocsHomeEmptyProps = {
  onClear?: () => void;
};

export function DocsHomeEmpty({ onClear }: DocsHomeEmptyProps) {
  const t = useTranslations('docs.home.filter');

  return (
    <div className="flex flex-col items-center justify-center rounded-[14px] border border-dashed border-[var(--color-border)] bg-[var(--color-row-bg)] px-6 py-14 text-center">
      <div className="flex size-10 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface-card)] text-[var(--color-nav-muted)] shadow-[var(--shadow-card-sm)]">
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className="size-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="9" cy="9" r="6" />
          <path d="m13.5 13.5 4 4" />
          <path d="M7 9h4" />
        </svg>
      </div>

      <p className="mt-3.5 text-[0.875rem] font-medium text-[var(--color-text)]">
        {t('empty')}
      </p>

      {onClear ? (
        <button
          type="button"
          onClick={onClear}
          className="mt-3.5 inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-card)] px-3.5 py-1.5 text-[0.76rem] font-medium text-[var(--color-text)] shadow-[var(--shadow-card-sm)] transition-colors hover:bg-[var(--color-nav-item-hover)]"
        >
          <span>{t('clearSearch')}</span>
        </button>
      ) : null}
    </div>
  );
}
