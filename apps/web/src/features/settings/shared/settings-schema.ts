import type { AppLocale } from '@/i18n/config/locales';
import type { SettingsPageData } from './settings-types';
import { getAccountSettingsSection } from '../account/account-schema';
import { getAiSettingsSection } from '../ai/ai-schema';
import { getAppearanceSettingsSection } from '../appearance/appearance-schema';
import { getLanguageSettingsSection } from '../language/language-schema';
import { getMusicSettingsSection } from '../music/music-schema';

export function getSettingsPageData(locale: AppLocale): SettingsPageData {
  const isZh = locale === 'zh';

  return {
    title: isZh ? '基础设置' : 'Basic Settings',
    description: isZh ? '用户使用偏好' : 'User preferences.',
    sections: [
      getAppearanceSettingsSection(locale),
      getLanguageSettingsSection(locale),
      getAccountSettingsSection(locale),
      getMusicSettingsSection(locale),
      getAiSettingsSection(locale),
    ],
  };
}
