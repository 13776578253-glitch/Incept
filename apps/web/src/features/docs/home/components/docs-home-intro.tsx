import type { DocsHomeIntroModel } from '@/features/docs/shared/types';

type DocsHomeIntroProps = {
  intro: DocsHomeIntroModel;
};

export function DocsHomeIntro({ intro }: DocsHomeIntroProps) {
  return (
    <section className="pb-4 pt-8 md:pb-5 md:pt-10">
      <div className="mx-auto max-w-[860px]">
        <div className="xl:pl-12 2xl:pl-18">
          <div className="max-w-[46rem] space-y-2">
            {intro.eyebrow ? (
              <p className="text-[0.72rem] font-medium uppercase tracking-[0.16em] text-[var(--color-nav-muted)]">
                {intro.eyebrow}
              </p>
            ) : null}

            <h1 className="max-w-[44rem] text-[1.5rem] font-semibold tracking-[-0.05em] text-[var(--color-text)] md:text-[2rem]">
                {intro.title}
            </h1>

            <div className="max-w-[44rem] border-b border-[color:color-mix(in_srgb,var(--color-border)_72%,transparent)] pb-6">

            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
