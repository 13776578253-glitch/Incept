'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import type { AppLocale } from '@/i18n/config/locales';
import { withLocalePath } from '@/i18n/utils/locale-path';

function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M8 3.5v9M3.5 8h9" />
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
      className="group relative block h-[116px] w-full rounded-[14px] outline-none focus-visible:ring-1 focus-visible:ring-indigo-500/30"
    >
      <article
        className="relative flex h-[116px] w-full flex-col justify-between rounded-[14px] border border-indigo-200/60 dark:border-indigo-500/25 bg-gradient-to-br from-[#ebeaf8] to-[#deddf5] dark:from-[#1e1b4b]/50 dark:to-[#312e81]/30 p-3.5 transition-all duration-200 hover:from-[#e3e1f5] hover:to-[#d5d4f2] dark:hover:from-[#25225c] dark:hover:to-[#3c3899] hover:shadow-[0_4px_20px_-4px_rgba(124,58,237,0.18)]"
        aria-label={t('home.addDoc')}
      >
        <div className="min-w-0">
          {/* Top row: Plus icon badge */}
          <div className="flex items-center justify-between">
            <span className="flex size-5 items-center justify-center rounded-md bg-indigo-950/10 text-indigo-900 dark:bg-white/10 dark:text-indigo-200">
              <PlusIcon />
            </span>
          </div>

          {/* Title & subtitle */}
          <h3 className="mt-2 truncate text-[0.9375rem] font-semibold leading-snug tracking-[-0.01em] text-indigo-950 dark:text-indigo-100">
            {t('home.addDoc')}
          </h3>

          <p className="mt-0.5 truncate text-[0.8125rem] leading-[1.45] text-indigo-900/65 dark:text-indigo-300/70">
            {t('home.addDocDesc')}
          </p>
        </div>

        {/* Footer: Circular arrow */}
        <div className="flex items-center justify-end pt-1">
          <div
            className="flex size-7 shrink-0 items-center justify-center rounded-full bg-indigo-950/10 dark:bg-white/10 text-indigo-900/70 dark:text-indigo-200 transition-all duration-150 group-hover:bg-indigo-950/15 dark:group-hover:bg-white/20 group-hover:text-indigo-950 dark:group-hover:text-white group-hover:translate-x-0.5"
            aria-hidden="true"
          >
            <ArrowRightIcon />
          </div>
        </div>
      </article>
    </Link>
  );
}
