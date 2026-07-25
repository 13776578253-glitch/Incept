import { DocsHomeListItem } from '@/features/docs/home/components/docs-home-list-item';
import type { DocsHomeGroupModel } from '@/features/docs/shared/types';

type DocsHomeGroupSectionProps = {
  group: DocsHomeGroupModel;
  sectionId: string;
  entriesLabel: string;
};

export function DocsHomeGroupSection({
  group,
  sectionId,
  entriesLabel,
}: DocsHomeGroupSectionProps) {
  return (
    <section id={sectionId} className="mx-auto max-w-[860px] scroll-mt-28">
      <div className="xl:pl-12 2xl:pl-18">
        <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-[1.05rem] font-medium tracking-[-0.02em] text-[var(--color-text)] md:text-[1.1rem]">
              {group.label}
            </h2>
          </div>
          <p className="text-[0.72rem] font-medium uppercase tracking-[0.16em] text-[var(--color-nav-muted)] md:mr-12 xl:mr-16">
            {entriesLabel}
          </p>
        </div>

        <div className="space-y-5 md:space-y-6">
          {group.entries.map((entry) => (
            <DocsHomeListItem key={entry.id} article={entry} />
          ))}
        </div>
      </div>
    </section>
  );
}
