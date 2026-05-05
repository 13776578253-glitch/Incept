import { useLocale, useTranslations } from 'next-intl';
import type { ResolvedMockDocsArticle } from '@/lib/mock/pages/docs/docs-permissions.mock';

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

type DocsArchiveListItemProps = {
  article: ResolvedMockDocsArticle;
};

export function DocsArchiveListItem({ article }: DocsArchiveListItemProps) {
  const locale = useLocale();
  const t = useTranslations('docs');
  const roleLabel = t(`roles.${article.requiredRole}`);
  const isLocked = !article.isAccessible;

  return (
    <article className="grid gap-3 md:grid-cols-[7.5rem_minmax(0,1fr)] md:gap-8" aria-label={article.title}>
      <div className="text-[0.92rem] leading-7 text-[var(--color-nav-dropdown-description)] md:pt-0.5">
        {formatPublishedDate(article.publishedAt, locale)}
      </div>

      <div className="min-w-0">
        <div className="space-y-3">
          <div className="flex items-start gap-2">
            <h3
              className={`max-w-[34ch] text-[1.1rem] font-medium leading-8 tracking-[-0.025em] md:text-[1.18rem] ${
                isLocked
                  ? 'text-[color-mix(in_srgb,var(--color-text)_82%,transparent)]'
                  : 'text-[var(--color-text)]'
              }`}
            >
              {article.title}
            </h3>

            {isLocked ? (
              <span className="mt-1.5 inline-flex items-center gap-1 text-[0.74rem] text-[var(--color-nav-muted)]">
                <LockIcon />
                <span>{roleLabel}</span>
              </span>
            ) : null}
          </div>

          <p
            className={`max-w-[60ch] text-[0.95rem] leading-7 ${
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
    </article>
  );
}
