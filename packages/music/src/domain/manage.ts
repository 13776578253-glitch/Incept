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
