import { prisma } from '../../client';
import type { MusicTrackRecord } from '../types';

const musicTrackSelection = {
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

// 排序固定为 position ASC, id ASC：position 允许重复，加上 id 才能保证顺序稳定，与表上的 (isActive, position) 索引配合
const musicTrackOrder = [{ position: 'asc' }, { id: 'asc' }] as const;

// 播放器只消费启用中的曲目
export async function listActiveMusicTracks(): Promise<MusicTrackRecord[]> {
  return prisma.musicTrack.findMany({
    where: { isActive: true },
    orderBy: [...musicTrackOrder],
    select: musicTrackSelection,
  });
}

// 导入与一致性检查需要看到全部行，包括已停用的：停用行仍然指向自己的镜像文件，它引用过的文件不算孤儿
export async function listAllMusicTracks(): Promise<MusicTrackRecord[]> {
  return prisma.musicTrack.findMany({
    orderBy: [...musicTrackOrder],
    select: musicTrackSelection,
  });
}
