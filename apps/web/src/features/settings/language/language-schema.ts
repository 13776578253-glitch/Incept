import type { AppLocale } from '@/i18n/config/locales';
import type { SettingsSection } from '../shared/settings-types';

export function getLanguageSettingsSection(locale: AppLocale): SettingsSection {
  if (locale === 'zh') {
    return {
      id: 'language',
      label: '语言',
      description: '管理界面语言与语音',
      visibility: 'public',
      rows: [
        {
          id: 'language-locale',
          label: '界面语言',
          description: '切换当前界面的主要显示语言',
          controlType: 'language-segmented',
          state: 'interactive',
          visibility: 'public',
          options: [
            { id: 'zh', label: '简体中文' },
            { id: 'en', label: 'English' },
          ],
        },
      ],
    };
  }

  return {
    id: 'language',
    label: 'Language',
    description: 'Manage the interface language and voice',
    visibility: 'public',
    rows: [
      {
        id: 'language-locale',
        label: 'Interface language',
        description: 'Switch the primary display language for the current interface.',
        controlType: 'language-segmented',
        state: 'interactive',
        visibility: 'public',
        options: [
          { id: 'zh', label: 'Simplified Chinese' },
          { id: 'en', label: 'English' },
        ],
      },
    ],
  };
}
