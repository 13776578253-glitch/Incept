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
    <section id={sectionId} className="scroll-mt-28">
      <div>
        <div className="mb-4 flex items-end justify-center gap-150">
          <div className="text-center">
            <h2 className="text-[1.05rem] font-medium tracking-[-0.02em] text-[var(--color-text)] md:text-[1.1rem]">
              {group.label}
            </h2>
          </div>
          <p className="text-[0.72rem] font-medium uppercase tracking-[0.16em] text-[var(--color-nav-muted)]">
            {entriesLabel}
          </p>
        </div>

        <div className="space-y-2">
          {group.entries.map((entry) => (
            <DocsHomeListItem key={entry.id} article={entry} />
          ))}
        </div>
      </div>
    </section>
  );
}
