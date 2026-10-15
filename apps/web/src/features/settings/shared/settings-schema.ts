import type { AppLocale } from '@/i18n/config/locales';
import { collectSettingsSectionContributions, mountManifest } from '@/mount/registry';
import type { SettingsPageData } from './settings-types';
import { getAccountSettingsSection } from '../account/account-schema';
import { getAppearanceSettingsSection } from '../appearance/appearance-schema';
import { getLanguageSettingsSection } from '../language/language-schema';

export function getSettingsPageData(locale: AppLocale, includeProjects = false): SettingsPageData {
  const isZh = locale === 'zh';

  return {
    title: isZh ? '基础设置' : 'Basic Settings',
    description: isZh ? '用户使用偏好' : 'User preferences.',
    sections: [
      getAppearanceSettingsSection(locale),
      getLanguageSettingsSection(locale),
      getAccountSettingsSection(locale),
      ...(includeProjects ? [{
        id: 'projects',
        label: isZh ? '项目与功能' : 'Projects & surfaces',
        description: isZh ? '管理项目名称及开放状态' : 'Manage project names and availability.',
        visibility: 'admin' as const,
        rows: [],
      }] : []),
      // 注册表贡献分区按 order 追加
      // history: 原 music 硬编码已由注册面持有，贡献分区插在 ai 之前以保持原分区顺序
      ...collectSettingsSectionContributions(mountManifest).map((contribution) => ({
        id: contribution.id,
        label: contribution.label(locale),
        description: contribution.description?.(locale),
        visibility: contribution.visibility,
        rows: [],
      })),
    ],
  };
}
