import type {
  MusicImportSummary,
  MusicLibraryImportEntry,
  MusicLibraryRecord,
  MusicTrackImportEntry,
  MusicTrackRecord,
  MusicTrackRowEntry,
} from './types';

export type MusicImportMode = 'legacy' | 'authority';

export type ExistingMusicState = {
  tracks: MusicTrackRecord[];
  libraries: MusicLibraryRecord[];
  memberships: Array<{ libraryId: string; trackId: string }>;
};

export type MusicImportPlanInput = {
  // null 表示清单没有声明曲库：旧清单模式
  libraries: MusicLibraryImportEntry[] | null;
  tracks: MusicTrackImportEntry[];
  existing: ExistingMusicState;
};

export type MusicImportPlan = {
  mode: MusicImportMode;
  trackCreates: MusicTrackRowEntry[];
  trackUpdates: MusicTrackRowEntry[];
  trackDeactivations: string[];
  libraryCreates: MusicLibraryImportEntry[];
  libraryUpdates: Array<{ key: string; title: string; position: number }>;
  libraryDeactivations: string[];
  membershipAdds: Array<{ libraryKey: string; trackKey: string }>;
  membershipRemovals: Array<{ libraryKey: string; trackKey: string }>;
  warnings: string[];
  summary: MusicImportSummary;
};

const DEFAULT_LIBRARY_KEY = 'default';

// 成员关系不属于曲目行，剥离，否则 Prisma 会收到未知字段
function toTrackRow(entry: MusicTrackImportEntry): MusicTrackRowEntry {
  return {
    trackKey: entry.trackKey,
    title: entry.title,
    artist: entry.artist,
    audioUrl: entry.audioUrl,
    contentHash: entry.contentHash,
    mimeType: entry.mimeType,
    fileSize: entry.fileSize,
    durationSeconds: entry.durationSeconds,
    publishedAt: entry.publishedAt,
    position: entry.position,
  };
}

function pairKey(libraryKey: string, trackKey: string): string {
  return JSON.stringify([libraryKey, trackKey]);
}

function decodePairKey(key: string): { libraryKey: string; trackKey: string } {
  const [libraryKey, trackKey] = JSON.parse(key) as [string, string];

  return { libraryKey, trackKey };
}

function isTrackChanged(current: MusicTrackRecord, entry: MusicTrackImportEntry): boolean {
  return (
    current.title !== entry.title ||
    current.artist !== entry.artist ||
    current.audioUrl !== entry.audioUrl ||
    current.contentHash !== entry.contentHash ||
    current.mimeType !== entry.mimeType ||
    current.fileSize !== entry.fileSize ||
    current.durationSeconds !== entry.durationSeconds ||
    (current.publishedAt?.getTime() ?? null) !== (entry.publishedAt?.getTime() ?? null) ||
    current.position !== entry.position ||
    !current.isActive
  );
}

// contentHash 在数据库里唯一：两个 trackKey 不能指向同一段字节。
// 清单内部的冲突、以及清单与"留在库里的旧行"（从清单消失只是停用，行和哈希都还在）之间的冲突，
// 都在这里一次性报出来——否则写事务会在中途撞唯一索引回滚，报错还看不出是哪两个 key。
function assertUniqueContentHashes(input: MusicImportPlanInput): void {
  const manifestTrackKeys = new Set(input.tracks.map((entry) => entry.trackKey));
  const hashOwner = new Map<string, string>();

  const claim = (hash: string, trackKey: string): void => {
    const owner = hashOwner.get(hash);

    if (owner !== undefined && owner !== trackKey) {
      throw new Error(
        `The same audio content is assigned to two tracks ("${owner}" and "${trackKey}"); one trackKey per piece of content.`,
      );
    }

    hashOwner.set(hash, trackKey);
  };

  for (const entry of input.tracks) {
    claim(entry.contentHash, entry.trackKey);
  }

  // 清单里仍然存在的行会按条目更新哈希
  for (const row of input.existing.tracks) {
    if (row.contentHash === null || manifestTrackKeys.has(row.trackKey)) continue;

    claim(row.contentHash, row.trackKey);
  }
}

// 只做计算，不碰数据库
export function planMusicImport(input: MusicImportPlanInput): MusicImportPlan {
  const mode: MusicImportMode = input.libraries === null ? 'legacy' : 'authority';

  assertUniqueContentHashes(input);

  const existingTrackByKey = new Map(input.existing.tracks.map((row) => [row.trackKey, row]));
  const manifestTrackKeys = new Set(input.tracks.map((entry) => entry.trackKey));

  const trackCreates: MusicTrackRowEntry[] = [];
  const trackUpdates: MusicTrackRowEntry[] = [];
  const warnings: string[] = [];
  let unchangedTracks = 0;

  for (const entry of input.tracks) {
    const current = existingTrackByKey.get(entry.trackKey);

    if (!current) {
      trackCreates.push(toTrackRow(entry));
      continue;
    }

    // 契约要求内容变化时换用新的 trackKey / 此处不阻断导入（重新编码是合法操作），只记录警告，使契约被违反这件事可见
    if (current.contentHash && current.contentHash !== entry.contentHash) {
      warnings.push(
        `content changed under an unchanged trackKey "${entry.trackKey}"; the contract is to issue a new trackKey`,
      );
    }

    if (isTrackChanged(current, entry)) {
      trackUpdates.push(toTrackRow(entry));
      continue;
    }

    unchangedTracks += 1;
  }

  // 从清单里消失的曲目只是停用，不删除：行和镜像都保留，历史可追溯
  const trackDeactivations = input.existing.tracks
    .filter((row) => row.isActive && !manifestTrackKeys.has(row.trackKey))
    .map((row) => row.trackKey);

  const existingLibraryByKey = new Map(input.existing.libraries.map((row) => [row.key, row]));
  const libraryCreates: MusicLibraryImportEntry[] = [];
  const libraryUpdates: Array<{ key: string; title: string; position: number }> = [];
  let libraryDeactivations: string[] = [];
  let unchangedLibraries = 0;

  // 声明集合：权威模式就是清单的顶层曲库；旧清单模式补出一个 default，且不改动已存在 default 的标题与顺序
  const declaredLibraries = new Map<string, MusicLibraryImportEntry>();

  if (mode === 'authority') {
    for (const entry of input.libraries ?? []) {
      declaredLibraries.set(entry.key, entry);
    }

    for (const entry of declaredLibraries.values()) {
      const current = existingLibraryByKey.get(entry.key);

      if (!current) {
        libraryCreates.push(entry);
        continue;
      }

      if (current.title !== entry.title || current.position !== entry.position || !current.isActive) {
        libraryUpdates.push({ key: entry.key, title: entry.title, position: entry.position });
        continue;
      }

      unchangedLibraries += 1;
    }

    // 停用而非删除，与曲目一致
    libraryDeactivations = input.existing.libraries
      .filter((row) => row.isActive && !declaredLibraries.has(row.key))
      .map((row) => row.key);
  } else {
    const existingDefault = existingLibraryByKey.get(DEFAULT_LIBRARY_KEY);
    const defaultPosition =
      input.existing.libraries.reduce((highest, row) => Math.max(highest, row.position), 0) + 1;

    if (!existingDefault) {
      libraryCreates.push({
        key: DEFAULT_LIBRARY_KEY,
        title: DEFAULT_LIBRARY_KEY,
        position: defaultPosition,
      });
      declaredLibraries.set(DEFAULT_LIBRARY_KEY, {
        key: DEFAULT_LIBRARY_KEY,
        title: DEFAULT_LIBRARY_KEY,
        position: defaultPosition,
      });
    } else {
      declaredLibraries.set(DEFAULT_LIBRARY_KEY, {
        key: DEFAULT_LIBRARY_KEY,
        title: existingDefault.title,
        position: existingDefault.position,
      });

      if (existingDefault.isActive) {
        unchangedLibraries += 1;
      } else {
        libraryUpdates.push({
          key: DEFAULT_LIBRARY_KEY,
          title: existingDefault.title,
          position: existingDefault.position,
        });
      }
    }
  }

  const libraryKeyById = new Map(input.existing.libraries.map((row) => [row.id, row.key]));
  const trackKeyById = new Map(input.existing.tracks.map((row) => [row.id, row.trackKey]));
  const existingPairs = new Set<string>();

  for (const row of input.existing.memberships) {
    const libraryKey = libraryKeyById.get(row.libraryId);
    const trackKey = trackKeyById.get(row.trackId);

    if (libraryKey && trackKey) {
      existingPairs.add(pairKey(libraryKey, trackKey));
    }
  }

  const targetPairs = new Map<string, { libraryKey: string; trackKey: string }>();

  for (const entry of input.tracks) {
    for (const libraryKey of entry.libraries) {
      targetPairs.set(pairKey(libraryKey, entry.trackKey), { libraryKey, trackKey: entry.trackKey });
    }
  }

  const membershipAdds = [...targetPairs.entries()]
    .filter(([key]) => !existingPairs.has(key))
    .map(([, pair]) => pair);

  // 权威模式整体重写：目标集合之外的成员关系全部移除；旧清单模式只补 default，不删任何成员关系
  const membershipRemovals =
    mode === 'authority'
      ? [...existingPairs].filter((key) => !targetPairs.has(key)).map(decodePairKey)
      : [];

  const summary: MusicImportSummary = {
    created: trackCreates.length,
    updated: trackUpdates.length,
    unchanged: unchangedTracks,
    deactivated: trackDeactivations.length,
    libraries: {
      created: libraryCreates.length,
      updated: libraryUpdates.length,
      unchanged: unchangedLibraries,
      deactivated: libraryDeactivations.length,
    },
    memberships: {
      added: membershipAdds.length,
      removed: membershipRemovals.length,
    },
    warnings,
  };

  return {
    mode,
    trackCreates,
    trackUpdates,
    trackDeactivations,
    libraryCreates,
    libraryUpdates,
    libraryDeactivations,
    membershipAdds,
    membershipRemovals,
    warnings,
    summary,
  };
}
