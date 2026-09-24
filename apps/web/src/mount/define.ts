import { createElement, type ComponentType } from 'react';

import type { AppLocale } from '@/i18n/config/locales';
import type { SettingsVisibility } from '@/features/settings/shared/settings-types';
import type { SettingsSectionContribution } from './types';

// 泛型面板在此做类型擦除，贡献方无需在调用点写断言
// （独立成模块：registry ↔ music 曾靠函数声明提升侥幸成环，helper 下沉后环消失）
export function defineSettingsSectionContribution<TData>(contribution: {
  id: string;
  label: (locale: AppLocale) => string;
  visibility: SettingsVisibility;
  order: number;
  panel: ComponentType<{ data: TData | null }>;
}): SettingsSectionContribution {
  return {
    ...contribution,
    panel: ({ data }) => createElement(contribution.panel, { data: data as TData | null }),
  };
}
