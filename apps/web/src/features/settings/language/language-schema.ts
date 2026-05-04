import type { AppLocale } from '@/i18n/config/locales';
import type { SettingsGroup } from '../shared/settings-types';

export function getLanguageSettingsGroup(locale: AppLocale): SettingsGroup {
  if (locale === 'zh') {
    return {
      id: 'language-settings',
      title: '语言',
      description: '管理界面语言，并为后续语音与扩展语言预留位置。',
      domains: [
        {
          id: 'language',
          anchorId: 'language',
          label: '语言',
          description: '管理界面语言，并为后续语音语言预留位置。',
          visibility: 'public',
          defaultExpanded: true,
          rows: [
            {
              id: 'language-locale',
              label: '界面语言',
              description: '切换当前界面的主要显示语言。',
              controlType: 'language-segmented',
              state: 'interactive',
              visibility: 'public',
              options: [
                { id: 'zh', label: '简体中文' },
                { id: 'en', label: 'English' },
              ],
            },
            {
              id: 'language-voice',
              label: '语音语言',
              description: '为后续 TTS 与朗读场景预留的语言设置入口。',
              controlType: 'select',
              state: 'locked',
              visibility: 'public',
              value: '稍后开放',
              badge: 'Locked',
            },
            {
              id: 'language-extra',
              label: '扩展语言',
              description: '后续预留日语等更多界面语言扩展。',
              controlType: 'status',
              state: 'locked',
              visibility: 'public',
              value: '保留中',
            },
          ],
        },
      ],
    };
  }

  return {
    id: 'language-settings',
    title: 'Language',
    description:
      'Manage interface language and reserve room for voice and extra language settings.',
    domains: [
      {
        id: 'language',
        anchorId: 'language',
        label: 'Language',
        description:
          'Manage interface language and reserve room for future voice language settings.',
        visibility: 'public',
        defaultExpanded: true,
        rows: [
          {
            id: 'language-locale',
            label: 'Interface language',
            description:
              'Switch the primary language used across the current interface.',
            controlType: 'language-segmented',
            state: 'interactive',
            visibility: 'public',
            options: [
              { id: 'zh', label: 'Simplified Chinese' },
              { id: 'en', label: 'English' },
            ],
          },
          {
            id: 'language-voice',
            label: 'Voice language',
            description:
              'Reserved for later TTS and read-aloud language settings.',
            controlType: 'select',
            state: 'locked',
            visibility: 'public',
            value: 'Not yet available',
            badge: 'Locked',
          },
          {
            id: 'language-extra',
            label: 'Extra languages',
            description: 'Reserve space for later additions such as Japanese.',
            controlType: 'status',
            state: 'locked',
            visibility: 'public',
            value: 'Reserved',
          },
        ],
      },
    ],
  };
}
