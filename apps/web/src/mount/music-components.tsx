'use client';

import { useLocale } from 'next-intl';

import type { MusicAdminData } from '@incept/music/application';
import { MusicPlayerFloatingMount, MusicSettingsPanel } from '@incept/music/react';

import { useLanguage } from '@/hooks/use-language';
import { localeConfig } from '@/i18n/config/locales';

// 挂载配置：隐藏路由清单由注册面持有（原逐布局 JSX 传参随收编收敛到这里）
export const MUSIC_HIDDEN_ROUTE_PREFIXES = [
  '/settings',
  '/workspace',
  '/studio',
  '/docs/style-lab',
  '/docs/import-preview',
];

// 浮层需要响应式 locale；next-intl 留在宿主，包只收 locale 值（修订 18 的边界口径）
export function MusicFloatingOverlay() {
  const locale = useLocale();

  return (
    <MusicPlayerFloatingMount
      locale={locale}
      locales={localeConfig.locales}
      hiddenRoutePrefixes={MUSIC_HIDDEN_ROUTE_PREFIXES}
    />
  );
}

// 分区面板需要 locale；宿主语言 hook 在此转接，包面板只收 MusicLocale（修订 17② 的逆变接口）
export function MusicSettingsSectionPanelHost({ data }: { data: MusicAdminData | null }) {
  const { language } = useLanguage();

  return <MusicSettingsPanel locale={language} data={data} />;
}
