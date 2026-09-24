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

// 设置分区贡献：整块 React 面板；loader 只存在于服务端注册表类型（R10 强制，防服务端闭包进客户端包图）
export type SettingsSectionContributionPanelProps = {
  data: unknown;
};

export type SettingsSectionContribution<TData = unknown> = {
  id: string;
  label: (locale: AppLocale) => string;
  // 分区说明（侧栏与分区头复用）；迁移自内置分区的 description 文案，缺省即不渲染
  description?: (locale: AppLocale) => string;
  visibility: SettingsVisibility;
  order: number;
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
