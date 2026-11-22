'use client';

import { NavigationLink as Link } from '@/components/layouts/navigation-link';
import { useLocale, useTranslations } from 'next-intl';
import type { AppLocale } from '@/i18n/config/locales';
import { withLocalePath } from '@/i18n/utils/locale-path';

function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4 text-[var(--color-text)]/80" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
      <path d="M8 3v10M3 8h10" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 8h9M9 4.5 12.5 8 9 11.5" />
    </svg>
  );
}

export function DocsHomeAddCard() {
  const locale = useLocale() as AppLocale;
  const t = useTranslations('docs');
  const href = withLocalePath(locale, '/settings?section=docs');

  return (
    <Link
      href={href}
      className="group relative block h-[116px] w-full rounded-[var(--radius-card,14px)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring-focus)]"
    >
      <article
        className="docs-add-card-surface relative flex h-[116px] w-full flex-col justify-between rounded-[var(--radius-card,14px)] border border-[var(--color-border-card,var(--color-border))] p-3.5 shadow-[var(--shadow-card-sm)] transition-all duration-150 group-hover:border-[var(--color-border-strong)] group-hover:shadow-[var(--shadow-card-hover)]"
        aria-label={t('home.addDoc')}
      >
        <div className="min-w-0">
          {/* Bare plus icon directly on card */}
          <PlusIcon />

          {/* Title right below plus icon without redundant subtitle */}
          <h3 className="mt-2.5 text-[length:var(--text-base)] font-medium leading-snug tracking-[-0.01em] text-[var(--color-text)]">
            {t('home.addDoc')}
          </h3>
        </div>

        {/* Footer: Circular arrow button on bottom-right matching DocsHomeCard baseline */}
        <div className="flex items-center justify-end pt-1">
          <div
            className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-card)]/60 text-[var(--color-text)]/75 transition-all duration-150 group-hover:bg-[color-mix(in_oklab,var(--color-accent)_16%,var(--color-surface-card))] group-hover:text-[var(--color-accent)] group-hover:translate-x-0.5"
            aria-hidden="true"
          >
            <ArrowRightIcon />
          </div>
        </div>
      </article>
    </Link>
  );
}
