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
      className="group relative flex h-full flex-col justify-between rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface-card)] p-5 shadow-[var(--shadow-card-sm)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--color-text-soft)] hover:shadow-[var(--shadow-card-hover)]"
      aria-label={article.title}
    >
      <div>
        {/* Top meta row */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {isCollection ? (
              <span
                className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[0.66rem] font-medium"
                style={{
                  color: 'var(--badge-amber-fg)',
                  backgroundColor: 'var(--badge-amber-bg)',
                  borderColor: 'var(--badge-amber-border)',
                }}
              >
                <CollectionIcon />
                <span>{t('home.filter.collections')}</span>
              </span>
            ) : (
              <span
                className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[0.66rem] font-medium"
                style={{
                  color: 'var(--badge-indigo-fg)',
                  backgroundColor: 'var(--badge-indigo-bg)',
                  borderColor: 'var(--badge-indigo-border)',
                }}
              >
                <ArticleIcon />
                <span>{t('home.filter.standalone')}</span>
              </span>
            )}

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
          </div>

          <time
            dateTime={article.publishedAt}
            className="font-mono text-[0.72rem] tabular-nums text-[var(--color-nav-muted)]"
          >
            {formatPublishedDate(article.publishedAt, locale)}
          </time>
        </div>

        {/* Title & Summary */}
        <div className="mt-3.5 space-y-2">
          <h3 className="text-[1.02rem] font-semibold leading-[1.38] tracking-[-0.015em] text-[var(--color-text)] transition-colors group-hover:text-[var(--badge-sky-icon)]">
            {article.title}
          </h3>

          {article.summary ? (
            <p className="line-clamp-2 text-[0.8125rem] leading-relaxed text-[var(--color-text-muted)]">
              {article.summary}
            </p>
          ) : null}

          {isLocked ? (
            <p className="text-[0.72rem] leading-5 text-[var(--color-nav-muted)]">
              {t('access.requiresRole', { role: roleLabel })}
            </p>
          ) : null}
        </div>
      </div>

      {/* Bottom meta row */}
      <div className="mt-5 flex items-center justify-between border-t border-[var(--color-border)] pt-3.5">
        <div className="min-w-0">
          {tag ? (
            <span className="inline-flex items-center gap-1 rounded-md border border-[var(--surface-chip-border)] bg-[var(--surface-chip-bg)] px-2 py-0.5 text-[0.68rem] font-medium text-[var(--color-text-muted)]">
              <span aria-hidden="true" className="text-[var(--color-text-soft)]">#</span>
              <span className="truncate">{tag}</span>
            </span>
          ) : (
            <span />
          )}
        </div>

        <div className="inline-flex shrink-0 items-center gap-1 text-[0.76rem] font-medium text-[var(--color-text-soft)] transition-colors group-hover:text-[var(--color-text)]">
          <span>{isCollection ? t('home.filter.viewSeriesAction') : t('home.filter.readAction')}</span>
          <span className="inline-block transition-transform duration-200 group-hover:translate-x-0.5">→</span>
        </div>
      </div>
    </article>
  );

  if (!href || isLocked) {
    return (
      <div className="h-full">
        {cardContent}
      </div>
    );
  }

  return (
    <Link
      href={href}
      className="group block h-full rounded-[14px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--badge-sky-dot)]"
    >
      {cardContent}
    </Link>
  );
}
