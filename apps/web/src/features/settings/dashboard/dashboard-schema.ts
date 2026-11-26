import type { AppLocale } from '@/i18n/config/locales';
import type { SettingsSection } from '../shared/settings-types';

export function getDashboardSettingsSection(locale: AppLocale): SettingsSection {
  if (locale === 'zh') {
    return {
      id: 'dashboard',
      label: '仪表盘',
      description: '图表色彩与固化展示模型',
      visibility: 'public',
      rows: [],
    };
  }

  return {
    id: 'dashboard',
    label: 'Dashboard',
    description: 'Chart palette and pinned models',
    visibility: 'public',
    rows: [],
  };
}
