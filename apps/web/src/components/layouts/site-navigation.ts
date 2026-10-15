import type { AppLocale } from '@/i18n/config/locales';
import type { PrimaryNavItem } from '@/components/layouts/navigation.types';
import { withLocalePath } from '@/i18n/utils/locale-path';

type Translate = (key: string) => string;

// 导航栏目挂载：文档（含下拉）、路线图、仪表盘、关于

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
          ],
        },
      ],
    },
    {
      id: 'roadmap',
      label: t('primary.roadmap'),
      href: withLocale('/roadmap'),
      matchPrefix: withLocale('/roadmap'),
    },
    {
      id: 'dashboard',
      label: t('primary.dashboard'),
      href: withLocale('/dashboard'),
      matchPrefix: withLocale('/dashboard'),
    },
    {
      id: 'about',
      label: t('primary.about'),
      href: withLocale('/about'),
      matchPrefix: withLocale('/about'),
    },
  ];
}
