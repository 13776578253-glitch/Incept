import { NavigationLink as Link } from '@/components/layouts/navigation-link';
import { ArrowRight } from 'lucide-react';
import Image from 'next/image';
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
    <div className="mx-auto w-full max-w-[var(--docs-shell-max-width)] px-5 pb-20 md:px-8 md:pb-24">
      <section className="mx-auto flex min-h-[18rem] w-full max-w-[var(--docs-content-width)] flex-col items-center justify-center border-b border-[var(--color-border-faint,var(--color-border))] py-8 text-center md:min-h-[21rem] md:py-10">
        <div className="flex flex-col items-center gap-6 md:gap-7">
          <div className="relative size-28 shrink-0 overflow-hidden rounded-full border border-[var(--color-border-faint,var(--color-border))] bg-[var(--color-bg)] p-1 shadow-[var(--shadow-avatar)] md:size-32">
            <Image
              src="/images/about/avatar-test.jpg"
              alt={t('identity.avatarAlt')}
              fill
              sizes="(min-width: 768px) 128px, 112px"
              className="rounded-full object-cover"
              priority
            />
          </div>

          <div className="text-center">
            <p className="text-[0.64rem] font-medium uppercase tracking-[0.16em] text-[var(--color-nav-muted)]">
              {t('identity.eyebrow')}
            </p>
            <h1 className="mt-1.5 text-[1.9rem] font-semibold tracking-[-0.055em] text-[var(--color-text)] md:text-[2.35rem]">
              {t('identity.name')}
            </h1>
            <p className="mt-2.5 text-[0.98rem] leading-7 text-[var(--color-text-muted)] md:text-[1.04rem]">
              {t('identity.role')}
            </p>
          </div>
        </div>
      </section>

      {sections.map((section) => (
        <section
          key={section.id}
          className="mx-auto w-full max-w-[var(--docs-content-width)] border-b border-[var(--color-border-faint,var(--color-border))] py-7 text-left md:py-9"
        >
          <div>
            <h2 className="inline-flex items-center gap-2.5 text-[1.15rem] font-semibold tracking-[-0.03em] text-[var(--color-text)] md:text-[1.24rem]">
              <span
                aria-hidden="true"
                className="h-3.5 w-1 shrink-0 rounded-full bg-[var(--color-accent)]"
              />
              <span>{section.title}</span>
            </h2>
            <div className="mt-4 space-y-4">
              {section.blocks.map((block) => (
                <DocsBlockRenderer key={block.id} block={block} />
              ))}
            </div>
          </div>
        </section>
      ))}

      <div className="mx-auto w-full max-w-[var(--docs-content-width)] pt-7 md:pt-9">
        <Link
          href={activityHref}
          className="group -ml-2 inline-flex items-center gap-1.5 rounded-[8px] px-2 py-1 text-[0.82rem] font-medium text-[var(--color-text-muted)] transition-colors duration-150 hover:bg-[var(--color-nav-item-hover)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]"
        >
          <span>{t('activityLink')}</span>
          <ArrowRight
            aria-hidden="true"
            className="size-3.5 shrink-0 text-[var(--color-nav-muted)] transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-[var(--color-text)]"
          />
        </Link>
      </div>
    </div>
  );
}
