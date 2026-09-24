import { prisma } from '@incept/db';
import {
  musicLibrarySelection,
  musicTrackSelection,
  type MusicCatalogRecord,
  type MusicLibraryMembershipRecord,
  type MusicLibraryRecord,
  type MusicTrackRecord,
} from '../../../domain';

// 排序固定 position ASC, id ASC（position 允许重复）
const musicTrackOrder = [{ position: 'asc' }, { id: 'asc' }] as const;

// 曲库顺序：position ASC, id ASC
const musicLibraryOrder = [{ position: 'asc' }, { id: 'asc' }] as const;

// 播放器只消费启用中的曲目
export async function listActiveMusicTracks(): Promise<MusicTrackRecord[]> {
  return prisma.musicTrack.findMany({
    where: { isActive: true },
    orderBy: [...musicTrackOrder],
    select: musicTrackSelection,
  });
}

// 导入与一致性检查看全部行，含已停用
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

// 播放器的唯一读取入口：曲库、曲目与归属一次取回，组装只在这里发生
// 三个查询落在同一个 RepeatableRead 快照里
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

  // 每首曲目至少属于一个曲库：违反契约就拒绝输出
  const unassigned = catalogTracks.filter((track) => track.libraries.length === 0);

  if (unassigned.length > 0) {
    throw new Error(
      `active music tracks without an active library: ${unassigned.map((track) => track.trackKey).join(', ')}`,
    );
  }

  return { libraries, tracks: catalogTracks };
}
