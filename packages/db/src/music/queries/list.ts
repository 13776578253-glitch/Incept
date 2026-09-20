import { prisma } from '../../client';
import type {
  MusicLibraryRecord,
  MusicLibraryMembershipRecord,
  MusicTrackRecord,
} from '../types';

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

// 排序固定为 position ASC, id ASC：position 允许重复 / 与表上的 (isActive, position) 索引配合
const musicTrackOrder = [{ position: 'asc' }, { id: 'asc' }] as const;

export const musicLibrarySelection = {
  id: true,
  key: true,
  title: true,
  position: true,
  isActive: true,
} as const;

// 曲库自身顺序：position ASC, id ASC，与曲目同一套稳定排序规则
const musicLibraryOrder = [{ position: 'asc' }, { id: 'asc' }] as const;

export type MusicCatalogTrackRecord = MusicTrackRecord & {
  // 曲库 key，按 (position, id) 稳定排序；一首可以属于多个曲库
  libraries: string[];
};

export type MusicCatalogRecord = {
  libraries: MusicLibraryRecord[];
  tracks: MusicCatalogTrackRecord[];
};

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

export async function listAllMusicLibraries(): Promise<MusicLibraryRecord[]> {
  return prisma.musicLibrary.findMany({
    orderBy: [...musicLibraryOrder],
    select: musicLibrarySelection,
  });
}

export async function listMusicLibraryMemberships(): Promise<MusicLibraryMembershipRecord[]> {
  return prisma.musicLibraryItem.findMany({ select: { libraryId: true, trackId: true } });
}

// 播放器的唯一读取入口：曲库、曲目与归属一次取回，关联组装只在这里发生，路由只做 JSON 序列化
// 三个查询必须在同一个快照里完成：导入事务若在查询之间提交，就会拿到旧曲库 + 新曲目 + 新成员关系的混合结果，新曲目会被误判成"没有曲库"。Repeatable Read 保证单次请求看到同一版本
export async function listActiveMusicCatalog(): Promise<MusicCatalogRecord> {
  const [libraries, tracks, memberships] = await prisma.$transaction(
    (transaction) =>
      Promise.all([
        transaction.musicLibrary.findMany({
          where: { isActive: true },
          orderBy: [...musicLibraryOrder],
          select: musicLibrarySelection,
        }),
        transaction.musicTrack.findMany({
          where: { isActive: true },
          orderBy: [...musicTrackOrder],
          select: musicTrackSelection,
        }),
        transaction.musicLibraryItem.findMany({
          where: { library: { isActive: true } },
          orderBy: [{ library: { position: 'asc' } }, { library: { id: 'asc' } }],
          select: { trackId: true, library: { select: { id: true, key: true } } },
        }),
      ]),
    { isolationLevel: 'RepeatableRead' },
  );

  const libraryKeyById = new Map(libraries.map((row) => [row.id, row.key]));
  const libraryKeysByTrackId = new Map<string, string[]>();

  for (const membership of memberships) {
    const key = libraryKeyById.get(membership.library.id);

    if (!key) continue;

    const keys = libraryKeysByTrackId.get(membership.trackId) ?? [];
    keys.push(key);
    libraryKeysByTrackId.set(membership.trackId, keys);
  }

  const catalogTracks = tracks.map((track) => ({
    ...track,
    libraries: libraryKeysByTrackId.get(track.id) ?? [],
  }));

  // 每首曲目至少属于一个曲库是导入契约；拒绝输出无效 payload，而不是把它留给客户端发现
  const unassigned = catalogTracks.filter((track) => track.libraries.length === 0);

  if (unassigned.length > 0) {
    throw new Error(
      `active music tracks without an active library: ${unassigned.map((track) => track.trackKey).join(', ')}`,
    );
  }

  return { libraries, tracks: catalogTracks };
}
