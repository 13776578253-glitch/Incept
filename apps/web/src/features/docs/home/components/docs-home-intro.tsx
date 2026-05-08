import type { DocsHomeIntroModel } from '@/features/docs/shared/types';

type DocsHomeIntroProps = {
  intro: DocsHomeIntroModel;
};

export function DocsHomeIntro({ intro }: DocsHomeIntroProps) {
  return (
    <section className="pb-8 pt-12 md:pb-10 md:pt-16">
      <div className="mx-auto max-w-[860px]">
        <div className="xl:pl-12 2xl:pl-18">
          <div className="max-w-[46rem] space-y-6">
            {intro.eyebrow ? (
              <p className="text-[0.72rem] font-medium uppercase tracking-[0.16em] text-[var(--color-nav-muted)]">
                {intro.eyebrow}
              </p>
            ) : null}

            <div className="space-y-4">
              <h1 className="max-w-[44rem] text-4xl font-semibold tracking-[-0.05em] text-[var(--color-text)] md:text-5xl">
                {intro.title}
              </h1>
              {intro.description ? (
                <p className="max-w-[52ch] text-base leading-8 text-[var(--color-nav-dropdown-description)] md:text-[1.0625rem]">
                  {intro.description}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
