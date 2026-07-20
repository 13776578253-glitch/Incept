import type { AppLocale } from '@/i18n/config/locales';
import type { SettingsSection } from '../shared/settings-types';

export function getAppearanceSettingsSection(locale: AppLocale): SettingsSection {
  if (locale === 'zh') {
    return {
      id: 'appearance',
      label: '主题',
      description: '控制站点的整体观感与阅读明暗',
      visibility: 'public',
      rows: [
        {
          id: 'appearance-theme',
          label: '主题模式',
          description: '在亮色、暗色与跟随系统之间切换',
          controlType: 'theme-segmented',
          state: 'interactive',
          visibility: 'public',
        },
        {
          id: 'appearance-reading-filter',
          label: '护眼模式',
          description: '轻微暖黄色调，让长时间阅读更柔和',
          controlType: 'boolean-toggle',
          state: 'interactive',
          visibility: 'public',
          options: [
            { id: 'enabled', label: '已开启' },
            { id: 'disabled', label: '已关闭' },
          ],
        },
      ],
    };
  }

  return {
    id: 'appearance',
    label: 'Appearance',
    description: 'Control the overall appearance and reading contrast of the site.',
    visibility: 'public',
    rows: [
      {
        id: 'appearance-theme',
        label: 'Theme mode',
        description: 'Switch between light, dark, and system themes.',
        controlType: 'theme-segmented',
        state: 'interactive',
        visibility: 'public',
      },
      {
        id: 'appearance-reading-filter',
        label: 'Eye-comfort mode',
        description: 'Adds a subtle warm tint for a softer long-form reading environment.',
        controlType: 'boolean-toggle',
        state: 'interactive',
        visibility: 'public',
        options: [
          { id: 'enabled', label: 'On' },
          { id: 'disabled', label: 'Off' },
        ],
      },
    ],
  };
}
