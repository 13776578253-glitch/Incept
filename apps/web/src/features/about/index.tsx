import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { DocsBlockRenderer } from '@/features/docs/shared/renderers';
import type { DocsSectionModel } from '@/features/docs/shared/types';

type AboutFeatureProps = {
  sections: DocsSectionModel[];
  activityHref: string;
};

export function AboutFeature({ sections, activityHref }: AboutFeatureProps) {
  const t = useTranslations('about');

  return (
    <main className="mx-auto w-full max-w-[1000px] px-6 pb-24 md:px-8 md:pb-32 xl:pr-10 xl:pl-[5rem] 2xl:pr-12 2xl:pl-[6.75rem]">
      <section className="flex min-h-[27rem] flex-col items-center justify-center border-b border-[var(--color-border)] py-10 text-center md:min-h-[34rem] md:py-14">
        <div className="flex flex-col items-center gap-7 md:gap-8">
          <div className="flex size-32 shrink-0 items-center justify-center rounded-full border border-[var(--color-border)] bg-[color:color-mix(in_srgb,var(--color-text)_4%,transparent)] p-2 shadow-[0_18px_42px_-30px_color-mix(in_srgb,var(--color-text)_66%,transparent)] md:size-36">
            <div className="flex size-full items-center justify-center rounded-full border border-[color:color-mix(in_srgb,var(--color-text)_16%,transparent)] text-[1.65rem] font-semibold tracking-[-0.08em] text-[var(--color-text)]">
              IN
            </div>
          </div>

          <div className="text-center">
            <p className="text-[0.64rem] font-medium uppercase tracking-[0.16em] text-[var(--color-nav-muted)]">
              {t('identity.eyebrow')}
            </p>
            <h1 className="mt-1.5 text-[2rem] font-semibold tracking-[-0.06em] text-[var(--color-text)] md:text-[2.5rem]">
              {t('identity.name')}
            </h1>
            <p className="mt-3 text-[1rem] leading-7 text-[var(--color-text-muted)] md:text-[1.08rem]">
              {t('identity.role')}
            </p>
          </div>
        </div>
      </section>

      {sections.map((section) => (
        <section
          key={section.id}
          className="max-w-[860px] border-b border-[var(--color-border)] py-8 text-left xl:pl-12 2xl:pl-18 md:py-10"
        >
          <div>
            <h2 className="text-[1.18rem] font-semibold tracking-[-0.03em] text-[var(--color-text)] md:text-[1.28rem]">
              {section.title}
            </h2>
            <div className="mt-5 space-y-5">
              {section.blocks.map((block) => (
                <DocsBlockRenderer key={block.id} block={block} />
              ))}
            </div>
          </div>
        </section>
      ))}

      <div className="max-w-[860px] pt-8 xl:pl-12 2xl:pl-18 md:pt-10">
        <Link
          href={activityHref}
          className="inline-flex items-center gap-2 text-[0.82rem] font-medium text-[var(--color-nav-dropdown-description)] transition-colors hover:text-[var(--color-text)]"
        >
          <span>{t('activityLink')}</span>
          <span aria-hidden="true">&rarr;</span>
        </Link>
      </div>
    </main>
  );
}
