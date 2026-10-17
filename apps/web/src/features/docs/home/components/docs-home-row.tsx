'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import type { AppLocale } from '@/i18n/config/locales';
import { withLocalePath } from '@/i18n/utils/locale-path';
import type { DocsHomeArticleItemModel } from '@/features/docs/shared/types';

function CollectionIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3.75" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="4" width="9.5" height="9.5" rx="1.5" />
      <path d="M5 2.5h8a1.5 1.5 0 0 1 1.5 1.5v8" />
    </svg>
  );
}

function ArticleIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3.75" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
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

type DocsHomeRowProps = {
  article: DocsHomeArticleItemModel;
};

export function DocsHomeRow({ article }: DocsHomeRowProps) {
  const locale = useLocale() as AppLocale;
  const t = useTranslations('docs');
  const roleLabel = t(`roles.${article.requiredRole}`);
  const isLocked = !article.isAccessible;
  const href = article.href ? withLocalePath(locale, article.href) : null;
  const isCollection = article.entryType === 'collection';
  const tag = article.eyebrow || (article.tags && article.tags[0]);

  const rowContent = (
    <article
      className="group flex min-h-12 items-center justify-between gap-4 rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface-card)] px-4 py-2.5 shadow-[var(--shadow-card-sm)] transition-all hover:border-[var(--color-text-soft)] hover:bg-[var(--color-row-hover-bg)] md:px-5"
      aria-label={article.title}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          className="inline-flex shrink-0 items-center justify-center rounded-lg p-1.5"
          style={{
            backgroundColor: isCollection ? 'var(--badge-amber-bg)' : 'var(--badge-indigo-bg)',
            color: isCollection ? 'var(--badge-amber-fg)' : 'var(--badge-indigo-fg)',
          }}
        >
          {isCollection ? <CollectionIcon /> : <ArticleIcon />}
        </span>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-[0.9375rem] font-medium text-[var(--color-text)] transition-colors group-hover:text-[var(--badge-sky-icon)]">
              {article.title}
            </h3>

            {isLocked ? (
              <span
                className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[0.66rem] font-medium"
                style={{
                  color: 'var(--badge-rose-fg)',
                  backgroundColor: 'var(--badge-rose-bg)',
                  borderColor: 'var(--badge-rose-border)',
                }}
              >
                <LockIcon />
                <span>{roleLabel}</span>
              </span>
            ) : null}

            {tag ? (
              <span className="hidden sm:inline-flex items-center gap-0.5 rounded-md border border-[var(--surface-chip-border)] bg-[var(--surface-chip-bg)] px-1.5 py-0.25 text-[0.66rem] font-medium text-[var(--color-text-muted)]">
                <span aria-hidden="true" className="text-[var(--color-text-soft)]">#</span>
                <span>{tag}</span>
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3 text-[0.74rem] text-[var(--color-nav-muted)]">
        <time
          dateTime={article.publishedAt}
          className="font-mono tabular-nums"
        >
          {formatPublishedDate(article.publishedAt, locale)}
        </time>

        <span className="inline-block transition-transform duration-200 group-hover:translate-x-0.5">
          →
        </span>
      </div>
    </article>
  );

  if (!href || isLocked) {
    return <div>{rowContent}</div>;
  }

  return (
    <Link
      href={href}
      className="group block rounded-[12px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--badge-sky-dot)]"
    >
      {rowContent}
    </Link>
  );
}
