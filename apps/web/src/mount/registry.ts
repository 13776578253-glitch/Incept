import { createElement, type ReactNode } from 'react';

import type {
  MountFloatingOverlayContribution,
  MountLayoutSlotContribution,
  MountManifest,
  MountProviderDepth,
  MountProviderWrapperContribution,
  SettingsSectionContribution,
  SettingsSectionServerLoader,
} from './types';

// 静态注册表：负责汇集全站插件贡献；示例贡献只存在于测试
// history: music 模块化后作为首个贡献项在此注册
import { musicMountContributions, musicSettingsSectionContribution } from './music';

export const mountManifest: MountManifest = {
  contributions: musicMountContributions,
  settingsSections: [musicSettingsSectionContribution],
};

// 保留字分区 id：贡献注册不得复用，防劫持基础设置分区
// history: music 原为硬编码保留字，模块化后归注册面持有并从保留字移除
export const RESERVED_SETTINGS_SECTION_IDS = [
  'appearance',
  'language',
  'account',
  'docs',
  'projects',
  'ai',
];

function byOrder<T extends { order: number }>(items: readonly T[]): readonly T[] {
  return [...items].sort((a, b) => a.order - b.order);
}

export function collectProviderWrappers(
  manifest: MountManifest,
  depth: MountProviderDepth,
): readonly MountProviderWrapperContribution[] {
  return byOrder(
    manifest.contributions.filter(
      (item): item is MountProviderWrapperContribution =>
        item.kind === 'providerWrapper' && item.depth === depth,
    ),
  );
}

export function collectFloatingOverlays(
  manifest: MountManifest,
): readonly MountFloatingOverlayContribution[] {
  return byOrder(
    manifest.contributions.filter(
      (item): item is MountFloatingOverlayContribution => item.kind === 'floatingOverlay',
    ),
  );
}

export function collectLayoutSlotContributions(
  manifest: MountManifest,
  slot: string,
): readonly MountLayoutSlotContribution[] {
  return byOrder(
    manifest.contributions.filter(
      (item): item is MountLayoutSlotContribution =>
        item.kind === 'layoutSlot' && item.slot === slot,
    ),
  );
}

// 贡献分区收集：保留字与重复 id 注册即抛错，按 order 稳定排序
export function collectSettingsSectionContributions(
  manifest: MountManifest,
): readonly SettingsSectionContribution[] {
  const seen = new Set<string>();

  for (const section of manifest.settingsSections) {
    if (RESERVED_SETTINGS_SECTION_IDS.includes(section.id)) {
      throw new Error(`settings section id "${section.id}" is reserved by the host`);
    }
    if (seen.has(section.id)) {
      throw new Error(`settings section id "${section.id}" is registered twice`);
    }
    seen.add(section.id);
  }

  return byOrder(manifest.settingsSections);
}

export function findSettingsSectionContribution(
  manifest: MountManifest,
  id: string,
): SettingsSectionContribution | undefined {
  return collectSettingsSectionContributions(manifest).find((section) => section.id === id);
}

// owner 门控 loader 执行：非 owner 不调用 loader，数据位为 null
export async function loadSettingsSectionContributionData(
  loaders: readonly SettingsSectionServerLoader[],
  isOwner: boolean,
): Promise<Record<string, unknown>> {
  const data: Record<string, unknown> = {};

  for (const entry of loaders) {
    data[entry.id] = isOwner ? await entry.serverLoader() : null;
  }

  return data;
}

// 渲染 helper（createElement 实现，服务端布局与客户端 Provider 链共用）；order 小者包裹在外
export function renderProviderWrappers(
  manifest: MountManifest,
  depth: MountProviderDepth,
  children: ReactNode,
): ReactNode {
  return collectProviderWrappers(manifest, depth).reduceRight<ReactNode>(
    (inner, wrapper) => createElement(wrapper.wrap, null, inner),
    children,
  );
}

export function renderFloatingOverlays(manifest: MountManifest): ReactNode {
  return collectFloatingOverlays(manifest).map((item) =>
    createElement(item.overlay, { key: item.id }),
  );
}

export function renderLayoutSlot(manifest: MountManifest, slot: string): ReactNode {
  return collectLayoutSlotContributions(manifest, slot).map((item) =>
    createElement(item.render, { key: item.id }),
  );
}
