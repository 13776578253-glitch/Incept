import type { MockBottomSection } from '@/lib/mock/shared/mock-types';

type HomeBottomSectionProps = {
  section: MockBottomSection;
  eyebrow: string;
};

export function HomeBottomSection({
  section,
  eyebrow,
}: HomeBottomSectionProps) {
  return (
    <section className="pt-8 pb-18 md:pt-10 md:pb-24">
      <div className="mx-auto max-w-[920px]">
        <div className="xl:pl-12 2xl:pl-22">
          <div className="max-w-3xl space-y-4">
            <p className="text-[0.72rem] font-medium uppercase tracking-[0.16em] text-[var(--color-nav-muted)]">
              {eyebrow}
            </p>
            <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[var(--color-text)] md:text-3xl">
              {section.title}
            </h2>
            <p className="text-base leading-8 text-[var(--color-nav-dropdown-description)]">
              {section.description}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
