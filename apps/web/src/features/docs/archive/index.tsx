'use client';

import { useTranslations } from 'next-intl';

export function DocsArchiveFeature() {
  const t = useTranslations('docs.archivePage');

  return (
    <div className="mx-auto w-full max-w-[1120px] px-6 py-16 md:px-8 md:py-20 xl:pr-10 xl:pl-[5.5rem] 2xl:pr-12 2xl:pl-[7.5rem]">
      <div className="mx-auto max-w-[920px] xl:pl-12 2xl:pl-16">
        <div className="max-w-3xl space-y-4">
          <p className="text-[0.72rem] font-medium uppercase tracking-[0.16em] text-[var(--color-nav-muted)]">
            {t('eyebrow')}
          </p>
          <h1 className="text-4xl font-semibold tracking-[-0.05em] text-[var(--color-text)] md:text-5xl">
            {t('title')}
          </h1>
          <p className="text-base leading-8 text-[var(--color-nav-dropdown-description)] md:text-[1.0625rem]">
            {t('description')}
          </p>
        </div>
      </div>
    </div>
  );
}
