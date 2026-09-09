'use client';

import { useTranslations } from 'next-intl';
import { DocsHomeGroupSection } from '@/features/docs/home/components/docs-home-group-section';
import { DocsHomeIntro } from '@/features/docs/home/components/docs-home-intro';
import type { DocsHomePageModel } from '@/features/docs/shared/types';

type DocsHomeFeatureProps = {
  page: DocsHomePageModel;
};

export function DocsHomeFeature({ page }: DocsHomeFeatureProps) {
  const t = useTranslations('docs');
  const intro = {
    ...page.intro,
    // Keep the product label stable across interface locales.
    eyebrow: 'Docs',
    title: t('archive.title'),
  };

  return (
    <div className="mx-auto w-full max-w-[920px] px-5 md:px-8">
      <div className="mx-auto max-w-[720px] pb-16 pt-6 md:pb-20 md:pt-10">
        <main className="min-w-0">
          <DocsHomeIntro intro={intro} />

          <div className="space-y-10 md:space-y-12">
            {page.groups.map((group) => (
              <DocsHomeGroupSection
                key={group.id}
                group={group}
                sectionId={`docs-home-group-${group.id}`}
                entriesLabel={t('groups.entries', { count: group.entries.length })}
              />
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
