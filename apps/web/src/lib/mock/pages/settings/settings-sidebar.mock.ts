import type { AppLocale } from '@/i18n/config/locales';
import type { MockSettingsAnchor } from '@/lib/mock/shared/mock-types';

export function getSettingsSidebarMock(
  locale: AppLocale,
): MockSettingsAnchor[] {
  if (locale === 'zh') {
    return [
      {
        id: 'account',
        label: '账户',
        description: '身份与管理员入口',
      },
      {
        id: 'appearance',
        label: '主题',
        description: '显示与阅读观感',
      },
      {
        id: 'language',
        label: '语言',
        description: '界面语言与语音预留',
      },
      {
        id: 'ai',
        label: 'AI',
        description: '模型密钥与能力预留',
      },
    ];
  }

  return [
    {
      id: 'account',
      label: 'Account',
      description: 'Identity and admin access',
    },
    {
      id: 'appearance',
      label: 'Appearance',
      description: 'Display and reading feel',
    },
    {
      id: 'language',
      label: 'Language',
      description: 'Locale and voice placeholders',
    },
    {
      id: 'ai',
      label: 'AI',
      description: 'Keys and workspace capability prep',
    },
  ];
}
