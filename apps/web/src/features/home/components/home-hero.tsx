import type { MockHeroStatement, MockSectionIntro } from '@/lib/mock/shared/mock-types';

type HomeHeroProps = {
  intro: MockSectionIntro;
  statements: MockHeroStatement[];
};

export function HomeHero({ intro, statements }: HomeHeroProps) {
  return (
    <section className="pb-6 pt-12 md:pb-8 md:pt-16">
      <div className="mx-auto max-w-[920px]">
        <div className="max-w-3xl space-y-6">
          {intro.eyebrow ? (
            <p className="text-[0.72rem] font-medium uppercase tracking-[0.16em] text-[var(--color-nav-muted)]">
              {intro.eyebrow}
            </p>
          ) : null}
          <div className="space-y-4">
            <h1 className="max-w-2xl text-4xl font-semibold tracking-[-0.05em] text-[var(--color-text)] md:text-5xl">
              {intro.title}
            </h1>
            {intro.description ? (
              <p className="max-w-2xl text-base leading-8 text-[var(--color-nav-dropdown-description)] md:text-[1.0625rem]">
                {intro.description}
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-8 flex max-w-3xl flex-col gap-3">
          {statements.map((statement) => (
            <div
              key={statement.id}
              className="flex flex-col gap-1 border-l border-[var(--color-nav-dropdown-border)] pl-4"
            >
              <p className="text-[0.69rem] font-medium uppercase tracking-[0.16em] text-[var(--color-nav-muted)]">
                {statement.label}
              </p>
              <p className="text-sm leading-7 text-[var(--color-nav-dropdown-description)]">
                {statement.value}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
