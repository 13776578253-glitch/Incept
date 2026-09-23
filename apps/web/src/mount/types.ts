import type { ComponentType, ReactNode } from 'react';

import type { AppLocale } from '@/i18n/config/locales';
import type { SettingsVisibility } from '@/features/settings/shared/settings-types';

// 全局挂载贡献：provider 包裹（有序、两种包裹深度）、floating overlay、命名 layout slot
export type MountProviderDepth = 'provider-chain' | 'root-layout';

export type MountProviderWrapperContribution = {
  kind: 'providerWrapper';
  id: string;
  depth: MountProviderDepth;
  order: number;
  wrap: ComponentType<{ children: ReactNode }>;
};

export type MountFloatingOverlayContribution = {
  kind: 'floatingOverlay';
  id: string;
  order: number;
  overlay: ComponentType;
};

export type MountLayoutSlotContribution = {
  kind: 'layoutSlot';
  id: string;
  slot: string;
  order: number;
  render: ComponentType;
};

export type MountContribution =
  | MountProviderWrapperContribution
  | MountFloatingOverlayContribution
  | MountLayoutSlotContribution;

// 设置分区贡献：整块 React 面板；loader 数据经服务端注册表注入（见 src/mount/server.ts）
export type SettingsSectionContributionPanelProps = {
  data: unknown;
};

export type SettingsSectionContribution<TData = unknown> = {
  id: string;
  label: (locale: AppLocale) => string;
  visibility: SettingsVisibility;
  order: number;
  serverLoader?: () => Promise<TData | null>;
  panel: ComponentType<{ data: TData | null }>;
};

// 服务端 loader 注册条目：serverLoader 闭包只允许出现在服务端专用注册表
export type SettingsSectionServerLoader<TData = unknown> = {
  id: string;
  serverLoader: () => Promise<TData | null>;
};

// typed mount manifest：三类挂载贡献 + 设置分区贡献
export type MountManifest = {
  contributions: readonly MountContribution[];
  settingsSections: readonly SettingsSectionContribution[];
};
