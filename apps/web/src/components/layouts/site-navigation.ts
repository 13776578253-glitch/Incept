import type { AppLocale } from '@/i18n/config/locales';
import type { PrimaryNavItem } from '@/components/layouts/navigation.types';
import { withLocalePath } from '@/i18n/utils/locale-path';

type Translate = (key: string) => string;

// 导航栏目挂载 / atlas 为带下拉的图谱栏目；workspace / tools 为旧路径重定向，home / resources 仍先隐藏

export function createSiteNavigation(
  locale: AppLocale,
  t: Translate,
): PrimaryNavItem[] {
  const withLocale = (path: string) => withLocalePath(locale, path);

  return [
    // {
    //   id: 'home',
    //   label: t('primary.home'),
    //   href: withLocale('/'),
    // },
    {
      id: 'docs',
      label: t('primary.docs'),
      href: withLocale('/docs'),
      matchPrefix: withLocale('/docs'),
      showChevron: true,
      groups: [
        {
          id: 'docs-group',
          items: [
            {
              id: 'docs-entry',
              label: t('groups.docs.entry.label'),
              description: t('groups.docs.entry.description'),
              href: withLocale('/docs'),
            },
            {
              id: 'notes-entry',
              label: t('groups.docs.notes.label'),
              description: t('groups.docs.notes.description'),
              href: withLocale('/notes'),
            },
            // {
            //   id: 'docs-archive',
            //   label: t('groups.docs.archive.label'),
            //   description: t('groups.docs.archive.description'),
            //   href: withLocale('/docs/archive'),
            // },
          ],
        },
      ],
    },
    {
      id: 'atlas',
      label: t('primary.atlas'),
      href: withLocale('/atlas/roadmap'),
      matchPrefix: withLocale('/atlas'),
      showChevron: true,
      groups: [
        {
          id: 'atlas-group',
          items: [
            {
              id: 'atlas-roadmap',
              label: t('groups.atlas.roadmap.label'),
              description: t('groups.atlas.roadmap.description'),
              href: withLocale('/atlas/roadmap'),
            },
          ],
        },
      ],
    },
    // {
    //   id: 'resources',
    //   label: t('primary.resources'),
    //   href: withLocale('/resources'),
    //   matchPrefix: withLocale('/resources'),
    // },
    {
      id: 'about',
      label: t('primary.about'),
      href: withLocale('/about'),
      matchPrefix: withLocale('/about'),
    },
  ];
}
