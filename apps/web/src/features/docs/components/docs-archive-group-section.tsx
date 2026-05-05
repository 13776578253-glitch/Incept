import { DocsArchiveListItem } from '@/features/docs/components/docs-archive-list-item';
import type { ResolvedMockDocsArchiveGroup } from '@/lib/mock/pages/docs/docs-permissions.mock';

type DocsArchiveGroupSectionProps = {
  group: ResolvedMockDocsArchiveGroup;
  entriesLabel: string;
};

export function DocsArchiveGroupSection({
  group,
  entriesLabel,
}: DocsArchiveGroupSectionProps) {
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
          <DocsArchiveListItem key={article.id} article={article} />
        ))}
      </div>
    </section>
  );
}
