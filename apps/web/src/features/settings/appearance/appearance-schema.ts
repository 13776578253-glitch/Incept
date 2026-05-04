import type { AppLocale } from '@/i18n/config/locales';
import type { SettingsGroup } from '../shared/settings-types';

export function getAppearanceSettingsGroup(locale: AppLocale): SettingsGroup {
  if (locale === 'zh') {
    return {
      id: 'basic-settings',
      title: '基础设置',
      description: '先处理所有访客都能直接理解和使用的基础偏好。',
      domains: [
        {
          id: 'appearance',
          anchorId: 'appearance',
          label: '主题',
          description: '控制当前站点的整体观感与阅读明暗。',
          visibility: 'public',
          defaultExpanded: true,
          rows: [
            {
              id: 'appearance-theme',
              label: '主题模式',
              description: '在亮色、暗色与跟随系统之间切换。',
              controlType: 'theme-segmented',
              state: 'interactive',
              visibility: 'public',
            },
            {
              id: 'appearance-reading-filter',
              label: '护眼滤镜',
              description: '未来会加入更温和的夜间阅读滤镜与色温选项。',
              controlType: 'select',
              state: 'locked',
              visibility: 'public',
              value: '即将加入',
              badge: 'Locked',
            },
          ],
        },
      ],
    };
  }

  return {
    id: 'basic-settings',
    title: 'Basic Settings',
    description:
      'Start with the preferences every visitor can understand and use immediately.',
    domains: [
      {
        id: 'appearance',
        anchorId: 'appearance',
        label: 'Appearance',
        description: 'Control the overall look and reading contrast of the site.',
        visibility: 'public',
        defaultExpanded: true,
        rows: [
          {
            id: 'appearance-theme',
            label: 'Theme mode',
            description: 'Switch between light, dark, and system-following modes.',
            controlType: 'theme-segmented',
            state: 'interactive',
            visibility: 'public',
          },
          {
            id: 'appearance-reading-filter',
            label: 'Eye-comfort filter',
            description:
              'A softer night-reading filter and color temperature options will live here later.',
            controlType: 'select',
            state: 'locked',
            visibility: 'public',
            value: 'Coming later',
            badge: 'Locked',
          },
        ],
      },
    ],
  };
}
