import type { AppLocale } from '@/i18n/config/locales';
import { collectSettingsSectionContributions, mountManifest } from '@/mount/registry';
import type { SettingsPageData } from './settings-types';
import { getAccountSettingsSection } from '../account/account-schema';
import { getAiSettingsSection } from '../ai/ai-schema';
import { getAppearanceSettingsSection } from '../appearance/appearance-schema';
import { getLanguageSettingsSection } from '../language/language-schema';

export function getSettingsPageData(locale: AppLocale): SettingsPageData {
  const isZh = locale === 'zh';

  return {
    title: isZh ? '基础设置' : 'Basic Settings',
    description: isZh ? '用户使用偏好' : 'User preferences.',
    sections: [
      getAppearanceSettingsSection(locale),
      getLanguageSettingsSection(locale),
      getAccountSettingsSection(locale),
      // 注册表贡献分区按 order 追加（当前为空）
      // 2026-09-23（Phase 7）：music 硬编码已删除、分区归注册面持有；贡献分区插在 ai 之前以保持原分区顺序
      ...collectSettingsSectionContributions(mountManifest).map((contribution) => ({
        id: contribution.id,
        label: contribution.label(locale),
        visibility: contribution.visibility,
        rows: [],
      })),
      getAiSettingsSection(locale),
    ],
  };
}
