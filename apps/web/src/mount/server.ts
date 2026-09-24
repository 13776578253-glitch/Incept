import { readMusicAdminData } from '@incept/music/application';

import type { SettingsSectionServerLoader } from './types';

// 服务端专用注册表：serverLoader 闭包不得进入客户端包图，故与客户端 manifest 分离（music 在 Phase 7 注册）
// 2026-09-23（Phase 7）：music 已注册，owner 门控由收集器内的 loadSettingsSectionContributionData 执行
export const settingsSectionServerLoaders: readonly SettingsSectionServerLoader[] = [
  { id: 'music', serverLoader: () => readMusicAdminData() },
];
