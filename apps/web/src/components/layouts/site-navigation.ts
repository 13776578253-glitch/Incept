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
      href: withLocale('/atlas'),
      matchPrefix: withLocale('/atlas'),
      showChevron: true,
      groups: [
        {
          id: 'atlas-group',
          items: [
            {
              id: 'atlas-entry',
              label: t('groups.atlas.entry.label'),
              description: t('groups.atlas.entry.description'),
              href: withLocale('/atlas'),
            },
            {
              id: 'atlas-architecture',
              label: t('groups.atlas.architecture.label'),
              description: t('groups.atlas.architecture.description'),
              href: withLocale('/atlas/architecture'),
            },
            {
              id: 'atlas-roadmap',
              label: t('groups.atlas.roadmap.label'),
              description: t('groups.atlas.roadmap.description'),
              href: withLocale('/atlas/roadmap'),
            },
            {
              id: 'atlas-keywords',
              label: t('groups.atlas.keywords.label'),
              description: t('groups.atlas.keywords.description'),
              href: withLocale('/atlas/keywords'),
            },
            // 回放不在图谱栏目内：它是听内容的方式，而不是阅读项目的方式。
            // 这里只作为入口指向设置页，播放偏好与曲库都在那里。
            {
              id: 'atlas-playback',
              label: t('groups.atlas.playback.label'),
              description: t('groups.atlas.playback.description'),
              href: withLocale('/settings'),
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
