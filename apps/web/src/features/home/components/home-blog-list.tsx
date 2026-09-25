import type { AppLocale } from '@/i18n/config/locales';
import { withLocalePath } from '@/i18n/utils/locale-path';
import Link from 'next/link';
import type { MockBlogEntry } from '@/lib/mock/shared/mock-types';

type HomeBlogListProps = {
  entries: MockBlogEntry[];
  locale: AppLocale;
  eyebrow: string;
  title: string;
};

export function HomeBlogList({
  entries,
  locale,
  eyebrow,
  title,
}: HomeBlogListProps) {
  return (
    <section className="py-8 md:py-10">
      <div className="mx-auto max-w-[880px]">
        <div className="xl:pl-12 2xl:pl-16">
          <div className="mb-8 flex items-end justify-between gap-6">
            <div className="space-y-3">
              <p className="text-[0.72rem] font-medium uppercase tracking-[0.16em] text-[var(--color-nav-muted)]">
                {eyebrow}
              </p>
              <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[var(--color-text)] md:text-[2rem]">
                {title}
              </h2>
            </div>
          </div>

          <div className="divide-y divide-[var(--color-nav-dropdown-border)]">
            {entries.map((entry) => (
              <Link
                key={entry.id}
                href={withLocalePath(locale, entry.href)}
                className="grid gap-5 rounded-[12px] px-3 py-8 transition-colors hover:bg-[color:var(--color-row-hover-bg)] md:grid-cols-[156px_minmax(0,1fr)] md:items-center md:gap-7 md:px-4"
              >
                <div className="w-full max-w-[156px] justify-self-center overflow-hidden rounded-[18px] border border-[var(--color-nav-dropdown-border)] bg-[var(--color-nav-dropdown-bg)]">
                  <img
                    src={entry.imageSrc}
                    alt={entry.imageAlt}
                    className="h-[124px] w-full object-cover md:h-[104px]"
                  />
                </div>

                <div className="space-y-3">
                  <h3 className="text-[1.15rem] font-medium tracking-[-0.03em] text-[var(--color-text)] md:text-[1.2rem]">
                    {entry.title}
                  </h3>
                  <p className="max-w-[50ch] text-[0.92rem] leading-7 text-[var(--color-nav-dropdown-description)]">
                    {entry.summary}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
