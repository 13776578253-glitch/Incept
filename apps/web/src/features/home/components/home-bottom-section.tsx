import type { MockBottomSection } from '@/lib/mock/shared/mock-types';

type HomeBottomSectionProps = {
  section: MockBottomSection;
};

export function HomeBottomSection({ section }: HomeBottomSectionProps) {
  return (
    <section className="py-14 md:py-18">
      <div className="max-w-3xl space-y-4">
        <p className="text-[0.72rem] font-medium uppercase tracking-[0.16em] text-[var(--color-nav-muted)]">
          Closing note
        </p>
        <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[var(--color-text)] md:text-3xl">
          {section.title}
        </h2>
        <p className="text-base leading-8 text-[var(--color-nav-dropdown-description)]">
          {section.description}
        </p>
      </div>
    </section>
  );
}
