import { readMusicAdminData } from '@incept/music/application';

import type { SettingsSectionServerLoader } from './types';

// 服务端专用注册表：serverLoader 闭包不得进入客户端包图，故与客户端 manifest 分离
// history: music 数据加载器已在此注册，owner 门控由收集器 loadSettingsSectionContributionData 统一执行
export const settingsSectionServerLoaders: readonly SettingsSectionServerLoader[] = [
  { id: 'music', serverLoader: () => readMusicAdminData() },
];
