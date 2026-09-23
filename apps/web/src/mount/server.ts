import type { SettingsSectionServerLoader } from './types';

// 服务端专用注册表：serverLoader 闭包不得进入客户端包图，故与客户端 manifest 分离（music 在 Phase 7 注册）
export const settingsSectionServerLoaders: readonly SettingsSectionServerLoader[] = [];
