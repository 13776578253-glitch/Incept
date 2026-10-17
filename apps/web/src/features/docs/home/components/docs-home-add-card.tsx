'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import type { AppLocale } from '@/i18n/config/locales';
import { withLocalePath } from '@/i18n/utils/locale-path';

function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4 text-[#334155] dark:text-[#cbd5e1]" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
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
      className="group relative block h-[116px] w-full rounded-[14px] outline-none focus-visible:ring-1 focus-visible:ring-black/20 dark:focus-visible:ring-white/20"
    >
      <article
        className="relative flex h-[116px] w-full flex-col justify-between rounded-[14px] border border-black/[0.06] dark:border-white/[0.08] bg-gradient-to-br from-[#ccd4dd] via-[#cad2dc] to-[#d6d5e2] dark:from-[#202530] dark:via-[#1c212a] dark:to-[#262436] p-3.5 transition-all duration-150 hover:from-[#c5cdd6] hover:to-[#cfcee0] dark:hover:from-[#262c39] dark:hover:to-[#2d2b40]"
        aria-label={t('home.addDoc')}
      >
        <div className="min-w-0">
          {/* Bare plus icon directly on card */}
          <PlusIcon />

          {/* Title right below plus icon without redundant subtitle */}
          <h3 className="mt-2.5 text-[0.95rem] font-medium leading-snug tracking-[-0.01em] text-[#1e293b] dark:text-[#f8fafc]">
            {t('home.addDoc')}
          </h3>
        </div>

        {/* Footer: Circular arrow button on bottom-right matching DocsHomeCard baseline */}
        <div className="flex items-center justify-end pt-1">
          <div
            className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#dfdfe2] dark:bg-white/15 text-[#334155] dark:text-white transition-all duration-150 group-hover:bg-[#d5d5d9] dark:group-hover:bg-white/20 group-hover:translate-x-0.5"
            aria-hidden="true"
          >
            <ArrowRightIcon />
          </div>
        </div>
      </article>
    </Link>
  );
}
