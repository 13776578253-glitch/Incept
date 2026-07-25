import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import type { AppLocale } from '@/i18n/config/locales';
import { withLocalePath } from '@/i18n/utils/locale-path';
import type { DocsHomeArticleItemModel } from '@/features/docs/shared/types';

function LockIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="size-4">
      <path
        d="M5.75 8V6.75a4.25 4.25 0 1 1 8.5 0V8h.25A1.75 1.75 0 0 1 16.25 9.75v6.5A1.75 1.75 0 0 1 14.5 18h-9A1.75 1.75 0 0 1 3.75 16.25v-6.5A1.75 1.75 0 0 1 5.5 8h.25Zm1.5 0h5.5V6.75a2.75 2.75 0 1 0-5.5 0V8Z"
        fill="currentColor"
      />
    </svg>
  );
}

function formatPublishedDate(publishedAt: string, locale: string) {
  const date = new Date(publishedAt);

  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

type DocsHomeListItemProps = {
  article: DocsHomeArticleItemModel;
};

function CollectionIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="size-[0.95rem]">
      <path
        d="M3.5 4.75A1.25 1.25 0 0 1 4.75 3.5h8.5A1.25 1.25 0 0 1 14.5 4.75v8.5a1.25 1.25 0 0 1-1.25 1.25h-8.5A1.25 1.25 0 0 1 3.5 13.25v-8.5Zm2 1a.5.5 0 0 0-.5.5v5.5a.5.5 0 0 0 .5.5h6.25a.5.5 0 0 0 .5-.5v-5.5a.5.5 0 0 0-.5-.5H5.5Z"
        fill="currentColor"
      />
      <path
        d="M6.75 15.25a.75.75 0 0 0 .75.75h8A1.5 1.5 0 0 0 17 14.5v-8a.75.75 0 0 0-1.5 0v8H7.5a.75.75 0 0 0-.75.75Z"
        fill="currentColor"
      />
    </svg>
  );
}

function ArticleIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="size-[0.95rem]">
      <path
        d="M5 3.5A1.5 1.5 0 0 0 3.5 5v10A1.5 1.5 0 0 0 5 16.5h10a1.5 1.5 0 0 0 1.5-1.5V7.81a1.5 1.5 0 0 0-.44-1.06l-2.81-2.81A1.5 1.5 0 0 0 12.19 3.5H5Zm7 .9V7a.5.5 0 0 0 .5.5h2.6L12 4.4ZM6.75 9.25a.75.75 0 0 1 .75-.75h5a.75.75 0 0 1 0 1.5h-5a.75.75 0 0 1-.75-.75Zm0 3a.75.75 0 0 1 .75-.75h5.75a.75.75 0 0 1 0 1.5H7.5a.75.75 0 0 1-.75-.75Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function DocsHomeListItem({ article }: DocsHomeListItemProps) {
  const locale = useLocale() as AppLocale;
  const t = useTranslations('docs');
  const roleLabel = t(`roles.${article.requiredRole}`);
  const isLocked = !article.isAccessible;
  const href = article.href ? withLocalePath(locale, article.href) : null;

  const content = (
    <article
      className="grid gap-2 md:grid-cols-[6.75rem_minmax(0,1fr)_6.5rem] md:gap-x-7 md:gap-y-2"
      aria-label={article.title}
    >
      <div className="text-[0.92rem] leading-7 text-[var(--color-nav-dropdown-description)] md:pt-0.5">
        {formatPublishedDate(article.publishedAt, locale)}
      </div>

      <div className="min-w-0">
        <div className="space-y-1.5">
          <h3
            className={`max-w-[30ch] text-[1.1rem] font-medium leading-8 tracking-[-0.025em] md:text-[1.18rem] ${
              isLocked
                ? 'text-[color-mix(in_srgb,var(--color-text)_82%,transparent)]'
                : 'text-[var(--color-text)]'
            }`}
          >
            <span className="inline-flex items-center gap-2">
              <span className="text-[var(--color-nav-muted)]">
                {article.entryType === 'collection' ? <CollectionIcon /> : <ArticleIcon />}
              </span>
              <span>{article.title}</span>
            </span>
          </h3>

          <p
            className={`max-w-[52ch] text-[0.95rem] leading-7 ${
              isLocked
                ? 'text-[color-mix(in_srgb,var(--color-nav-dropdown-description)_78%,transparent)] blur-[1.15px]'
                : 'text-[var(--color-nav-dropdown-description)]'
            }`}
          >
            {article.summary}
          </p>

          {isLocked ? (
            <p className="text-[0.78rem] leading-6 text-[var(--color-nav-muted)]">
              {t('access.requiresRole', { role: roleLabel })}
            </p>
          ) : null}
        </div>
      </div>

      {isLocked ? (
        <div className="hidden items-start pt-1 md:-ml-7 md:flex md:justify-self-start">
          <span className="inline-flex items-center gap-1 text-[0.74rem] text-[var(--color-nav-muted)]">
            <LockIcon />
            <span>{roleLabel}</span>
          </span>
        </div>
      ) : (
        <div className="hidden md:block" />
      )}
    </article>
  );

  if (!href || isLocked) {
    return content;
  }

  return (
    <Link
      href={href}
      className="block rounded-[18px] transition-opacity hover:opacity-90"
    >
      {content}
    </Link>
  );
}
