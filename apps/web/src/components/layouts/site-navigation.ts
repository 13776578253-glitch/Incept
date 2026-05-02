import type { AppLocale } from '@/i18n/config/locales';
import type { PrimaryNavItem } from '@/components/layouts/navigation.types';
import { withLocalePath } from '@/i18n/utils/locale-path';

type Translate = (key: string) => string;

// TODO: 需要根据用户权限动态生成导航菜单
// 待修改
export function createSiteNavigation(
  locale: AppLocale,
  t: Translate,
): PrimaryNavItem[] {
  const withLocale = (path: string) => withLocalePath(locale, path);

  return [
    {
      id: 'home',
      label: t('primary.home'),
      href: withLocale('/'),
      matchPrefix: withLocale('/'),
    },
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
              id: 'docs-archive',
              label: t('groups.docs.archive.label'),
              description: t('groups.docs.archive.description'),
              href: withLocale('/docs'),
            },
            {
              id: 'docs-detail',
              label: t('groups.docs.detail.label'),
              description: t('groups.docs.detail.description'),
              href: withLocale('/docs/reference'),
            },
          ],
        },
      ],
    },
    {
      id: 'workspace',
      label: t('primary.workspace'),
      href: withLocale('/workspace'),
      matchPrefix: withLocale('/workspace'),
    },
    {
      id: 'about',
      label: t('primary.about'),
      href: withLocale('/about'),
      matchPrefix: withLocale('/about'),
    },
    {
      id: 'settings',
      label: t('primary.settings'),
      href: withLocale('/settings'),
      matchPrefix: withLocale('/settings'),
    },
  ];
}
