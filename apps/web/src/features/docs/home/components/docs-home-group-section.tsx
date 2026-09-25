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
        <header className="mb-3.5 flex items-center justify-between gap-4 px-1">
          <div className="flex min-w-0 items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-flex shrink-0"
              style={{ color: 'var(--badge-sky-icon)' }}
            >
              <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2.25" y="3" width="11.5" height="10.75" rx="2" />
                <path d="M5.25 1.75v2.5M10.75 1.75v2.5M2.25 6.5h11.5" />
              </svg>
            </span>
            <h2 className="text-[0.98rem] font-semibold tracking-[-0.015em] text-[var(--color-text)] md:text-[1.04rem]">
              {group.label}
            </h2>
          </div>
          <span className="rounded-full border border-[var(--surface-chip-border)] bg-[var(--surface-chip-bg)] px-2.5 py-0.5 text-[0.72rem] font-medium uppercase tracking-[0.12em] text-[var(--color-text-muted)] tabular-nums">
            {entriesLabel}
          </span>
        </header>

        <div className="space-y-2">
          {group.entries.map((entry) => (
            <DocsHomeListItem key={entry.id} article={entry} />
          ))}
        </div>
      </div>
    </section>
  );
}
