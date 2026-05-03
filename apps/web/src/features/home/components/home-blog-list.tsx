import type { AppLocale } from '@/i18n/config/locales';
import { withLocalePath } from '@/i18n/utils/locale-path';
import Link from 'next/link';
import type { MockBlogEntry } from '@/lib/mock/shared/mock-types';

type HomeBlogListProps = {
  entries: MockBlogEntry[];
  locale: AppLocale;
};

export function HomeBlogList({ entries, locale }: HomeBlogListProps) {
  return (
    <section className="py-14 md:py-18">
      <div className="mb-8 flex items-end justify-between gap-6">
        <div className="space-y-3">
          <p className="text-[0.72rem] font-medium uppercase tracking-[0.16em] text-[var(--color-nav-muted)]">
            Latest writing
          </p>
          <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[var(--color-text)] md:text-3xl">
            Notes, drafts, and interface thinking
          </h2>
        </div>
      </div>

      <div className="divide-y divide-[var(--color-nav-dropdown-border)]">
        {entries.map((entry) => (
          <Link
            key={entry.id}
            href={withLocalePath(locale, entry.href)}
            className="grid gap-6 py-8 transition-colors hover:bg-[var(--color-nav-item-hover)] first:pt-0 last:pb-0 md:grid-cols-[220px_minmax(0,1fr)] md:gap-10 md:px-2"
          >
            <div className="overflow-hidden rounded-[18px] border border-[var(--color-nav-dropdown-border)] bg-[var(--color-nav-dropdown-bg)]">
              <img
                src={entry.imageSrc}
                alt={entry.imageAlt}
                className="h-44 w-full object-cover md:h-36"
              />
            </div>

            <div className="space-y-4">
              <h3 className="text-xl font-medium tracking-[-0.03em] text-[var(--color-text)] md:text-[1.75rem]">
                {entry.title}
              </h3>
              <p className="max-w-3xl text-base leading-8 text-[var(--color-nav-dropdown-description)]">
                {entry.summary}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
