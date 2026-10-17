'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import type { AppLocale } from '@/i18n/config/locales';
import { withLocalePath } from '@/i18n/utils/locale-path';
import type { DocsHomeArticleItemModel } from '@/features/docs/shared/types';

function CollectionIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="4" width="9.5" height="9.5" rx="1.5" />
      <path d="M5 2.5h8a1.5 1.5 0 0 1 1.5 1.5v8" />
    </svg>
  );
}

function ArticleIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 2.5h6l3.5 3.5v7.5a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 13.5v-9.5A1.5 1.5 0 0 1 4 2.5Z" />
      <path d="M9.5 2.5V6H13" />
      <path d="M5 9h6M5 11.5h4" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3.25" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="7" width="9" height="7" rx="1.5" />
      <path d="M5.5 7V4.5a2.5 2.5 0 0 1 5 0V7" />
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

function formatPublishedDate(publishedAt: string, locale: string) {
  try {
    const date = new Date(publishedAt);
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(date);
  } catch {
    return publishedAt;
  }
}

type DocsHomeCardProps = {
  article: DocsHomeArticleItemModel;
};

export function DocsHomeCard({ article }: DocsHomeCardProps) {
  const locale = useLocale() as AppLocale;
  const t = useTranslations('docs');
  const roleLabel = t(`roles.${article.requiredRole}`);
  const isLocked = !article.isAccessible;
  const href = article.href ? withLocalePath(locale, article.href) : null;
  const isCollection = article.entryType === 'collection';
  const tag = article.eyebrow || (article.tags && article.tags[0]);

  const cardContent = (
    <article
      className="group relative flex h-[116px] w-full flex-col justify-between rounded-[14px] border border-black/[0.06] dark:border-white/[0.08] bg-[var(--color-row-bg)] p-3.5 transition-all duration-200 hover:bg-black/[0.045] dark:hover:bg-white/[0.06] hover:shadow-[0_4px_24px_-4px_rgba(139,92,246,0.14),0_2px_12px_-2px_rgba(56,189,248,0.12)]"
      aria-label={article.title}
    >
      {/* Chromatic iridescent border on hover/focus (炫彩渐变边框，无明显黑边框) */}
      <div
        className="pointer-events-none absolute -inset-[1px] rounded-[15px] opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-within:opacity-100 p-[1px] bg-gradient-to-br from-violet-500/50 via-sky-400/45 to-pink-500/45 [mask:linear-gradient(#fff_0_0)_content-box,linear-gradient(#fff_0_0)] [mask-composite:exclude]"
        aria-hidden="true"
      />

      <div className="min-w-0">
        {/* Title row */}
        <div className="flex items-center justify-between gap-2">
          <h3 className="truncate text-[0.9375rem] font-medium leading-snug tracking-[-0.01em] text-[var(--color-text)]">
            {article.title}
          </h3>

          {isLocked ? (
            <span
              className="inline-flex shrink-0 items-center gap-1 text-[0.66rem] font-medium text-[var(--badge-rose-fg)]"
              title={roleLabel}
            >
              <LockIcon />
              <span>{roleLabel}</span>
            </span>
          ) : null}
        </div>

        {/* Description / Summary */}
        {article.summary ? (
          <p className="mt-1 text-[0.8125rem] leading-[1.45] text-[var(--color-text-muted)] line-clamp-1">
            {article.summary}
          </p>
        ) : null}
      </div>

      {/* Footer: Metadata on left, DeepWiki circular arrow button on right */}
      <div className="flex items-center justify-between gap-2 pt-1">
        <div className="flex min-w-0 items-center gap-1.5 text-[0.75rem] text-[var(--color-text-muted)]">
          {isCollection ? (
            <span className="inline-flex items-center gap-1 text-[var(--badge-amber-fg)] font-medium">
              <CollectionIcon />
              <span>{t('home.filter.collections')}</span>
            </span>
          ) : tag ? (
            <span className="inline-flex items-center gap-1 truncate font-medium">
              <span className="text-[var(--color-text-soft)]">#</span>
              <span className="truncate">{tag}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <ArticleIcon />
              <span>{t('home.filter.standalone')}</span>
            </span>
          )}

          <span aria-hidden="true" className="text-[var(--color-nav-muted)] opacity-60">·</span>

          <time
            dateTime={article.publishedAt}
            className="shrink-0 font-mono text-[0.7rem] tabular-nums text-[var(--color-nav-muted)]"
          >
            {formatPublishedDate(article.publishedAt, locale)}
          </time>
        </div>

        {/* DeepWiki style circular arrow with stem and subtle chromatic hover */}
        <div
          className="flex size-7 shrink-0 items-center justify-center rounded-full bg-black/[0.06] dark:bg-white/[0.09] text-[var(--color-text-muted)] transition-all duration-200 group-hover:bg-gradient-to-br group-hover:from-violet-500/15 group-hover:to-sky-500/15 group-hover:text-violet-600 dark:group-hover:text-violet-300 group-hover:translate-x-0.5"
          aria-hidden="true"
        >
          <ArrowRightIcon />
        </div>
      </div>
    </article>
  );

  if (!href || isLocked) {
    return <div className="h-[116px] w-full">{cardContent}</div>;
  }

  return (
    <Link
      href={href}
      className="group block h-[116px] w-full rounded-[14px] outline-none focus-visible:ring-1 focus-visible:ring-black/20 dark:focus-visible:ring-white/20"
    >
      {cardContent}
    </Link>
  );
}
