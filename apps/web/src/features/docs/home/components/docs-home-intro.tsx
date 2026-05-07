import type { DocsHomeIntroModel } from '@/features/docs/shared/types';

type DocsHomeIntroProps = {
  intro: DocsHomeIntroModel;
};

export function DocsHomeIntro({ intro }: DocsHomeIntroProps) {
  return (
    <section className="pb-8 pt-12 md:pb-10 md:pt-16">
      <div className="mx-auto max-w-[920px]">
        <div className="max-w-3xl space-y-6">
          {intro.eyebrow ? (
            <p className="text-[0.72rem] font-medium uppercase tracking-[0.16em] text-[var(--color-nav-muted)]">
              {intro.eyebrow}
            </p>
          ) : null}

          <div className="space-y-4">
            <h1 className="max-w-3xl text-4xl font-semibold tracking-[-0.05em] text-[var(--color-text)] md:text-5xl">
              {intro.title}
            </h1>
            {intro.description ? (
              <p className="max-w-[56ch] text-base leading-8 text-[var(--color-nav-dropdown-description)] md:text-[1.0625rem]">
                {intro.description}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
