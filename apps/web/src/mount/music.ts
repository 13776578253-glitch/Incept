import type { MusicAdminData } from '@incept/music/application';
import {
  MusicPlayerPreferencesProvider,
  MusicPlayerRuntimeMount,
  getMusicSettingsSectionDescription,
  getMusicSettingsSectionLabel,
} from '@incept/music/react';

import { defineSettingsSectionContribution } from './define';
import { MusicFloatingOverlay, MusicSettingsSectionPanelHost } from './music-components';
import type { MountContribution, SettingsSectionContribution } from './types';

// 注册数据模块保持无 'use client'：带指令会让服务端图把导出数组当 client-reference 代理（构建期 TypeError）
export const musicMountContributions: readonly MountContribution[] = [
  {
    kind: 'providerWrapper',
    id: 'music.preferences',
    depth: 'provider-chain',
    order: 0,
    wrap: MusicPlayerPreferencesProvider,
  },
  {
    kind: 'providerWrapper',
    id: 'music.runtime',
    depth: 'root-layout',
    order: 0,
    wrap: MusicPlayerRuntimeMount,
  },
  {
    kind: 'floatingOverlay',
    id: 'music.floating',
    order: 0,
    overlay: MusicFloatingOverlay,
  },
];

// label 直接传包函数：(locale: MusicLocale) => string 赋给 (locale: AppLocale) => string，
// 编译器在此验证函数参数逆变前提（AppLocale ⊆ MusicLocale）
export const musicSettingsSectionContribution: SettingsSectionContribution =
  defineSettingsSectionContribution<MusicAdminData>({
    id: 'music',
    label: getMusicSettingsSectionLabel,
    description: getMusicSettingsSectionDescription,
    visibility: 'public',
    order: 0,
    panel: MusicSettingsSectionPanelHost,
  });
