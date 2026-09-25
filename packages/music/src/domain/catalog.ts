// 目录读取的纯形状与选择常量
// history: 原位于 packages/db/src/music/queries/list.ts，纯字段选择与目录类型剥离入 domain
import type { MusicLibraryRecord, MusicTrackRecord } from './types';

export const musicTrackSelection = {
  id: true,
  trackKey: true,
  title: true,
  artist: true,
  audioUrl: true,
  contentHash: true,
  mimeType: true,
  fileSize: true,
  durationSeconds: true,
  publishedAt: true,
  position: true,
  isActive: true,
} as const;

export const musicLibrarySelection = {
  id: true,
  key: true,
  title: true,
  position: true,
  isActive: true,
} as const;

export type MusicCatalogTrackRecord = MusicTrackRecord & {
  // 曲库 key，按 (position, id) 稳定排序；一首可以属于多个曲库
  libraries: string[];
};

export type MusicCatalogRecord = {
  libraries: MusicLibraryRecord[];
  tracks: MusicCatalogTrackRecord[];
};
