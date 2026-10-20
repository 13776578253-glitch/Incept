'use client';

import { useTranslations } from 'next-intl';
import { DocsHomeGroupSection } from '@/features/docs/home/components/docs-home-group-section';
import { DocsHomeIntro } from '@/features/docs/home/components/docs-home-intro';
import type { DocsHomePageModel } from '@/features/docs/shared/types';

type NotesHomeFeatureProps = {
  page: DocsHomePageModel;
};

export function NotesHomeFeature({ page }: NotesHomeFeatureProps) {
  const t = useTranslations('notes');
  const intro = {
    ...page.intro,
    eyebrow: t('home.eyebrow'),
    title: t('home.title'),
  };

  return (
    <div className="mx-auto w-full max-w-[920px] px-5 pt-6 pb-16 md:px-8 md:pt-8 md:pb-20">
      <h1 className="sr-only">{intro.title}</h1>

      <div className="space-y-10 md:space-y-12">
        {page.groups.map((group) => (
          <DocsHomeGroupSection
            key={group.id}
            group={group}
            sectionId={`notes-home-group-${group.id}`}
            entriesLabel={t('groups.entries', { count: group.entries.length })}
          />
        ))}
      </div>
    </div>
  );
}
