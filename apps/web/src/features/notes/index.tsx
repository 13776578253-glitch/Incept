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
    description: t('home.description'),
  };

  const getGroupDescription = (groupId: string, fallback?: string) => {
    if (groupId === '2026') return t('home.groupDescriptions.2026');
    if (groupId === '2025') return t('home.groupDescriptions.2025');
    return fallback;
  };

  return (
    <div className="mx-auto w-full max-w-[1000px] px-6 md:px-8 xl:pr-10 xl:pl-[5rem] 2xl:pr-12 2xl:pl-[6.75rem]">
      <DocsHomeIntro intro={intro} />

      <div className="space-y-14 pb-16 md:space-y-[4.5rem] md:pb-20">
        {page.groups.map((group) => (
          <DocsHomeGroupSection
            key={group.id}
            group={{
              ...group,
              description: getGroupDescription(group.id, group.description),
            }}
            sectionId={`notes-home-group-${group.id}`}
            entriesLabel={t('groups.entries', { count: group.entries.length })}
          />
        ))}
      </div>
    </div>
  );
}
