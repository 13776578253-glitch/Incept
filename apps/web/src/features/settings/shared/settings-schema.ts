import type { AppLocale } from '@/i18n/config/locales';
import type { SettingsAnchor, SettingsGroup, SettingsPageData } from './settings-types';
import { getAppearanceSettingsGroup } from '../appearance/appearance-schema';
import { getLanguageSettingsGroup } from '../language/language-schema';
import { getAccountSettingsGroup } from '../account/account-schema';
import { getAiSettingsGroup } from '../ai/ai-schema';

function orderSidebarByGroups(sidebar: SettingsAnchor[], groups: SettingsGroup[]) {
  const anchorOrder = groups.flatMap((group) =>
    group.domains.map((domain) => domain.anchorId),
  );

  return [...sidebar].sort((left, right) => {
    const leftIndex = anchorOrder.indexOf(left.id);
    const rightIndex = anchorOrder.indexOf(right.id);

    if (leftIndex === -1 && rightIndex === -1) {
      return 0;
    }

    if (leftIndex === -1) {
      return 1;
    }

    if (rightIndex === -1) {
      return -1;
    }

    return leftIndex - rightIndex;
  });
}

function getSidebar(locale: AppLocale): SettingsAnchor[] {
  if (locale === 'zh') {
    return [
      { id: 'account', label: '账户', description: '身份与管理员入口' },
      { id: 'appearance', label: '主题', description: '显示与阅读观感' },
      { id: 'language', label: '语言', description: '界面语言与语音预留' },
      { id: 'ai', label: 'AI', description: '模型密钥与能力预留' },
    ];
  }

  return [
    { id: 'account', label: 'Account', description: 'Identity and admin access' },
    { id: 'appearance', label: 'Appearance', description: 'Display and reading feel' },
    { id: 'language', label: 'Language', description: 'Locale and voice placeholders' },
    { id: 'ai', label: 'AI', description: 'Keys and workspace capability prep' },
  ];
}

export function getSettingsPageData(locale: AppLocale): SettingsPageData {
  const groups = [
    getAppearanceSettingsGroup(locale),
    getLanguageSettingsGroup(locale),
    getAccountSettingsGroup(locale),
    getAiSettingsGroup(locale),
  ];

  return {
    sidebar: orderSidebarByGroups(getSidebar(locale), groups),
    groups,
  };
}
