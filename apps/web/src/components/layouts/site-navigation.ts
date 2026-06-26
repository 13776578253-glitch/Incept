import type { AppLocale } from '@/i18n/config/locales';
import type { PrimaryNavItem } from '@/components/layouts/navigation.types';
import { withLocalePath } from '@/i18n/utils/locale-path';

type Translate = (key: string) => string;


// 导航栏目挂载 / 初始阶段 只保留 docs 和 about 两个入口，workspace / home /  resources 先隐藏

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
    // {
    //   id: 'workspace',
    //   label: t('primary.workspace'),
    //   href: withLocale('/workspace'),
    //   matchPrefix: withLocale('/workspace'),
    // },
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
