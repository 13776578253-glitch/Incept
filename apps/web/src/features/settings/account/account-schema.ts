import type { AppLocale } from '@/i18n/config/locales';
import type { SettingsSection } from '../shared/settings-types';

export function getAccountSettingsSection(locale: AppLocale): SettingsSection {
  if (locale === 'zh') {
    return {
      id: 'account',
      label: '账户',
      description: '身份与受控访问',
      visibility: 'public',
      rows: [],
    };
  }

  return {
    id: 'account',
    label: 'Account',
    description: 'Identity and controlled access.',
    visibility: 'public',
    rows: [],
  };
}
