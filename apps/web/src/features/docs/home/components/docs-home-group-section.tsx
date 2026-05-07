import { DocsHomeListItem } from '@/features/docs/home/components/docs-home-list-item';
import type { DocsHomeGroupModel } from '@/features/docs/shared/types';

type DocsHomeGroupSectionProps = {
  group: DocsHomeGroupModel;
  entriesLabel: string;
};

export function DocsHomeGroupSection({
  group,
  entriesLabel,
}: DocsHomeGroupSectionProps) {
  return (
    <section className="mx-auto max-w-[920px]">
      <div className="mb-6 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <h2 className="text-[1.05rem] font-medium tracking-[-0.02em] text-[var(--color-text)] md:text-[1.1rem]">
            {group.label}
          </h2>
          {group.description ? (
            <p className="max-w-[56ch] text-[0.88rem] leading-6 text-[var(--color-nav-dropdown-description)]">
              {group.description}
            </p>
          ) : null}
        </div>
        <p className="text-[0.72rem] font-medium uppercase tracking-[0.16em] text-[var(--color-nav-muted)]">
          {entriesLabel}
        </p>
      </div>

      <div className="space-y-7 md:space-y-9">
        {group.articles.map((article) => (
          <DocsHomeListItem key={article.id} article={article} />
        ))}
      </div>
    </section>
  );
}
