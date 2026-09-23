import { prisma } from '@incept/db';
import {
  musicLibrarySelection,
  musicTrackSelection,
  planMusicLibraryCreate,
  planMusicLibraryDelete,
  planMusicLibraryUpdate,
  planMusicTrackCreate,
  planMusicTrackUpdate,
  resolveLibraryId,
  type MusicCatalogTrackRecord,
  type MusicLibraryPatch,
  type MusicLibraryRecord,
  type MusicTrackPatch,
} from '../../domain';

// manage 的 Prisma 执行侧（原 packages/db/src/music/manage.ts 拆分而来）：纯规划在 ../../domain/manage.ts
// 事务边界、调用层级与顺序原样保留

// 永久删除：只删行与成员关系；镜像文件由清理入口（`pnpm music:cleanup`）回收
export async function deleteMusicTrack(input: { trackKey: string }): Promise<{ trackKey: string }> {
  return prisma.$transaction(async (transaction) => {
    const track = await transaction.musicTrack.findUnique({
      where: { trackKey: input.trackKey },
      select: { id: true, trackKey: true },
    });

    if (!track) {
      throw new Error(`The track "${input.trackKey}" does not exist.`);
    }

    await transaction.musicLibraryItem.deleteMany({ where: { trackId: track.id } });
    await transaction.musicTrack.delete({ where: { id: track.id } });

    return { trackKey: track.trackKey };
  });
}

export async function deleteMusicLibrary(input: { key: string }): Promise<{ key: string }> {
  return prisma.$transaction(async (transaction) => {
    const library = await transaction.musicLibrary.findUnique({
      where: { key: input.key },
      select: musicLibrarySelection,
    });

    if (!library) {
      throw new Error(`The library "${input.key}" does not exist.`);
    }

    const [libraries, memberCount] = await Promise.all([
      transaction.musicLibrary.findMany({ select: musicLibrarySelection }),
      transaction.musicLibraryItem.count({ where: { libraryId: library.id } }),
    ]);

    planMusicLibraryDelete({ library, libraries, memberCount });

    await transaction.musicLibrary.delete({ where: { id: library.id } });

    return { key: library.key };
  });
}

export async function updateMusicTrack(input: {
  trackKey: string;
  patch: MusicTrackPatch;
}): Promise<MusicCatalogTrackRecord> {
  return prisma.$transaction(async (transaction) => {
    const [track, libraries] = await Promise.all([
      transaction.musicTrack.findUnique({
        where: { trackKey: input.trackKey },
        select: musicTrackSelection,
      }),
      transaction.musicLibrary.findMany({ select: musicLibrarySelection }),
    ]);

    if (!track) {
      throw new Error(`The track "${input.trackKey}" does not exist.`);
    }

    const patch = planMusicTrackUpdate({ libraries, patch: input.patch });

    const updated = await transaction.musicTrack.update({
      where: { trackKey: input.trackKey },
      data: {
        ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
        ...(patch.artist !== undefined ? { artist: patch.artist } : {}),
        ...(patch.publishedAt !== undefined ? { publishedAt: patch.publishedAt } : {}),
        ...(patch.position !== undefined ? { position: patch.position } : {}),
        ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
      },
      select: musicTrackSelection,
    });

    let libraryKeys: string[];

    if (patch.libraryKeys !== undefined) {
      const libraryIdByKey = new Map(libraries.map((library) => [library.key, library.id]));

      await transaction.musicLibraryItem.deleteMany({ where: { trackId: updated.id } });
      await transaction.musicLibraryItem.createMany({
        data: patch.libraryKeys.map((key) => ({
          libraryId: resolveLibraryId(libraryIdByKey, key),
          trackId: updated.id,
        })),
      });

      libraryKeys = [...patch.libraryKeys];
    } else {
      const memberships = await transaction.musicLibraryItem.findMany({
        where: { trackId: updated.id },
        select: { library: { select: { key: true } } },
      });

      libraryKeys = memberships.map((membership) => membership.library.key);
    }

    return { ...updated, libraries: libraryKeys };
  });
}

export async function createMusicLibrary(input: {
  key: string;
  title: string;
}): Promise<MusicLibraryRecord> {
  return prisma.$transaction(async (transaction) => {
    const libraries = await transaction.musicLibrary.findMany({ select: musicLibrarySelection });
    const { position } = planMusicLibraryCreate({
      key: input.key,
      title: input.title,
      libraries,
    });

    return transaction.musicLibrary.create({
      data: { key: input.key.trim(), title: input.title.trim(), position, isActive: true },
      select: musicLibrarySelection,
    });
  });
}

export async function updateMusicLibrary(input: {
  key: string;
  patch: MusicLibraryPatch;
}): Promise<MusicLibraryRecord> {
  return prisma.$transaction(async (transaction) => {
    const library = await transaction.musicLibrary.findUnique({
      where: { key: input.key },
      select: musicLibrarySelection,
    });

    if (!library) {
      throw new Error(`The library "${input.key}" does not exist.`);
    }

    const [libraries, memberCount] = await Promise.all([
      transaction.musicLibrary.findMany({ select: musicLibrarySelection }),
      transaction.musicLibraryItem.count({ where: { libraryId: library.id } }),
    ]);

    const { moveMembersTo } = planMusicLibraryUpdate({
      library,
      libraries,
      memberCount,
      patch: input.patch,
    });

    if (input.patch.isActive === false && moveMembersTo) {
      const destination = libraries.find((candidate) => candidate.key === moveMembersTo);

      if (!destination) {
        throw new Error(`The destination library "${moveMembersTo}" does not exist.`);
      }

      const [members, alreadyThere] = await Promise.all([
        transaction.musicLibraryItem.findMany({
          where: { libraryId: library.id },
          select: { trackId: true },
        }),
        transaction.musicLibraryItem.findMany({
          where: { libraryId: destination.id },
          select: { trackId: true },
        }),
      ]);

      const destinationTrackIds = new Set(alreadyThere.map((row) => row.trackId));
      // 已经属于目标库的曲目不能再插一次：@@unique([libraryId, trackId]) 会拒绝
      const moving = members.filter((member) => !destinationTrackIds.has(member.trackId));

      await transaction.musicLibraryItem.deleteMany({ where: { libraryId: library.id } });

      if (moving.length > 0) {
        await transaction.musicLibraryItem.createMany({
          data: moving.map((member) => ({ libraryId: destination.id, trackId: member.trackId })),
        });
      }
    }

    return transaction.musicLibrary.update({
      where: { key: input.key },
      data: {
        ...(input.patch.title !== undefined ? { title: input.patch.title.trim() } : {}),
        ...(input.patch.position !== undefined ? { position: input.patch.position } : {}),
        ...(input.patch.isActive !== undefined ? { isActive: input.patch.isActive } : {}),
      },
      select: musicLibrarySelection,
    });
  });
}
