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
    eyebrow: 'Notes',
    title: t('home.title'),
  };

  return (
    <div className="mx-auto w-full max-w-[1000px] px-6 md:px-8 xl:pr-10 xl:pl-[5rem] 2xl:pr-12 2xl:pl-[6.75rem]">
      <DocsHomeIntro intro={intro} />

      <div className="space-y-10 pb-16 md:space-y-12 md:pb-20">
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
