import { prisma } from '../client';
import {
  musicLibrarySelection,
  musicTrackSelection,
  type MusicCatalogTrackRecord,
} from './queries/list';
import type { MusicLibraryRecord, MusicTrackRecord } from './types';

// 日常管理入口（网页上传、表格编辑）；批量导入走 plan.ts / import.ts
// 判断在纯函数里，Prisma 只负责执行

function nextPosition(rows: Array<{ position: number }>): number {
  return rows.reduce((highest, row) => Math.max(highest, row.position), 0) + 1;
}

export function resolveLibraryId(libraryIdByKey: Map<string, string>, key: string): string {
  const id = libraryIdByKey.get(key);

  if (!id) {
    throw new Error(`The library "${key}" does not exist.`);
  }

  return id;
}

export function assertMusicLibraryAssignments(
  libraryKeys: string[],
  libraries: MusicLibraryRecord[],
): void {
  if (libraryKeys.length === 0) {
    throw new Error('A track must belong to at least one library.');
  }

  if (new Set(libraryKeys).size !== libraryKeys.length) {
    throw new Error('A track cannot belong to the same library twice.');
  }

  const activeKeys = new Set(
    libraries.filter((library) => library.isActive).map((library) => library.key),
  );

  for (const key of libraryKeys) {
    if (!activeKeys.has(key)) {
      throw new Error(`The library "${key}" does not exist or is deactivated.`);
    }
  }
}

export function planMusicTrackCreate(input: {
  trackKey: string;
  libraryKeys: string[];
  tracks: MusicTrackRecord[];
  libraries: MusicLibraryRecord[];
}): { position: number } {
  if (input.trackKey.trim() === '') {
    throw new Error('A track key cannot be empty.');
  }

  if (input.tracks.some((track) => track.trackKey === input.trackKey)) {
    throw new Error(`The track key "${input.trackKey}" already exists.`);
  }

  assertMusicLibraryAssignments(input.libraryKeys, input.libraries);

  return { position: nextPosition(input.tracks) };
}

export type MusicTrackPatch = {
  title?: string;
  artist?: string | null;
  publishedAt?: Date | null;
  position?: number;
  isActive?: boolean;
  libraryKeys?: string[];
};

export function planMusicTrackUpdate(input: {
  libraries: MusicLibraryRecord[];
  patch: MusicTrackPatch;
}): MusicTrackPatch {
  const patch = { ...input.patch };

  if (patch.title !== undefined && patch.title.trim() === '') {
    throw new Error('A track title cannot be empty.');
  }

  if (patch.position !== undefined && (!Number.isInteger(patch.position) || patch.position < 1)) {
    throw new Error('A position must be a positive integer.');
  }

  if (patch.libraryKeys !== undefined) {
    assertMusicLibraryAssignments(patch.libraryKeys, input.libraries);
  }

  // 恢复一首曲目时必须同时给出归属：它原来的归属可能全在已停用的库里
  if (patch.isActive === true && patch.libraryKeys === undefined) {
    throw new Error('Reactivating a track requires its library assignments.');
  }

  return patch;
}

export function planMusicLibraryCreate(input: {
  key: string;
  title: string;
  libraries: MusicLibraryRecord[];
}): { position: number } {
  if (input.key.trim() === '') {
    throw new Error('A library key cannot be empty.');
  }

  if (input.title.trim() === '') {
    throw new Error('A library name cannot be empty.');
  }

  if (input.libraries.some((library) => library.key === input.key)) {
    throw new Error(`The library key "${input.key}" already exists.`);
  }

  return { position: nextPosition(input.libraries) };
}

export type MusicLibraryPatch = {
  title?: string;
  position?: number;
  isActive?: boolean;
  moveMembersTo?: string;
};

// 永久删除一个曲库的前提：没有成员，且不是最后一个启用中的曲库，两项都不满足时报错，不让活跃曲目失去归属
export function planMusicLibraryDelete(input: {
  library: MusicLibraryRecord;
  libraries: MusicLibraryRecord[];
  memberCount: number;
}): void {
  if (input.memberCount > 0) {
    throw new Error('A library with tracks cannot be deleted; move its tracks first.');
  }

  if (!input.library.isActive) return;

  const remaining = input.libraries.filter(
    (library) => library.isActive && library.id !== input.library.id,
  );

  if (remaining.length === 0) {
    throw new Error('The last active library cannot be deleted.');
  }
}

export function planMusicLibraryUpdate(input: {
  library: MusicLibraryRecord;
  libraries: MusicLibraryRecord[];
  memberCount: number;
  patch: MusicLibraryPatch;
}): { moveMembersTo: string | null } {
  const { patch } = input;

  if (patch.title !== undefined && patch.title.trim() === '') {
    throw new Error('A library name cannot be empty.');
  }

  if (patch.position !== undefined && (!Number.isInteger(patch.position) || patch.position < 1)) {
    throw new Error('A position must be a positive integer.');
  }

  if (patch.moveMembersTo !== undefined && patch.isActive !== false) {
    throw new Error('moveMembersTo only applies when deactivating a library.');
  }

  if (patch.isActive === false && input.library.isActive) {
    const remaining = input.libraries.filter(
      (library) => library.isActive && library.id !== input.library.id,
    );

    // 至少留一个活跃曲库
    if (remaining.length === 0) {
      throw new Error('The last active library cannot be deactivated.');
    }

    if (input.memberCount > 0) {
      const target = patch.moveMembersTo;

      if (!target) {
        throw new Error("Choose where this library's tracks should move before deactivating it.");
      }

      if (!remaining.some((library) => library.key === target)) {
        throw new Error(`The destination library "${target}" does not exist or is deactivated.`);
      }

      return { moveMembersTo: target };
    }
  }

  return { moveMembersTo: null };
}

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
