import type { DocsHomeIntroModel } from '@/features/docs/shared/types';

type DocsHomeIntroProps = {
  intro: DocsHomeIntroModel;
};

export function DocsHomeIntro({ intro }: DocsHomeIntroProps) {
  return (
    <section className="pb-16 md:pb-20">
      <div className="max-w-[46rem]">
          <div className="space-y-5">
            {intro.eyebrow ? (
              <p className="text-[0.72rem] font-medium uppercase tracking-[0.16em] text-[var(--color-nav-muted)]">
                {intro.eyebrow}
              </p>
            ) : null}

            <h1 className="max-w-[44rem] text-[2rem] font-semibold tracking-[-0.05em] text-[var(--color-text)] md:text-[2.65rem] md:leading-[1.08]">
              {intro.title}
            </h1>

          </div>
      </div>
    </section>
  );
}
