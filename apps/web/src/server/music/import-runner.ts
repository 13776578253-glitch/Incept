import fs from 'node:fs/promises';
import path from 'node:path';

import {
  importMusicCatalog,
  listAllMusicLibraries,
  listAllMusicTracks,
  listMusicLibraryMemberships,
} from '@incept/music/adapters';
import type {
  MusicImportSummary,
  MusicLibraryImportEntry,
  MusicLibraryMembershipRecord,
  MusicLibraryRecord,
  MusicTrackImportEntry,
  MusicTrackRecord,
} from '@incept/music/domain';

import { parseFile } from 'music-metadata';

import { getMusicContentRoot } from './content-root';
import {
  inspectMusicSource,
  musicMediaMirrorDirectory,
  musicMediaPublicPath,
  publishMusicMedia,
  removeMusicMediaByUrl,
} from './media-store';
import type { MusicMediaMode, MusicMediaOperation, MusicSourceInfo } from './media-store';

const DEFAULT_LIBRARY_KEY = 'default';

export type MusicManifestTrackEntry = {
  trackKey: string;
  file: string;
  title: string;
  artist: string | null;
  publishedAt: Date | null;
  position: number;
  // null 表示该曲目没有写 libraries / 字段含义由顶层是否声明曲库决定，解析阶段不做转换
  libraries: string[] | null;
};

export type MusicManifest = {
  // null 表示清单没有声明曲库：旧清单模式
  libraries: MusicLibraryImportEntry[] | null;
  tracks: MusicManifestTrackEntry[];
};

export type MusicManifestMode = 'legacy' | 'authority';

export type ResolvedMusicManifest = {
  mode: MusicManifestMode;
  // 旧清单模式为 null：曲库由导入层按隐式 default 处理
  libraries: MusicLibraryImportEntry[] | null;
  tracks: Array<MusicManifestTrackEntry & { libraries: string[] }>;
};

export type MusicImportPlanEntry = MusicManifestTrackEntry & {
  libraries: string[];
  source: MusicSourceInfo;
};

export type MusicImportPlan = {
  contentRoot: string;
  manifestPath: string;
  mode: MusicManifestMode;
  libraries: MusicLibraryImportEntry[] | null;
  entries: MusicImportPlanEntry[];
};

export type MusicMirrorIssue = {
  kind:
    | 'orphanMirror'
    | 'missingMirror'
    | 'notImported'
    | 'willDeactivate'
    | 'staleAudioUrl'
    | 'libraryNotImported'
    | 'membershipMismatch'
    | 'willDeactivateLibrary';
  detail: string;
};

function requireString(value: unknown, field: string, index: number): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`music.json entry ${index}: "${field}" must be a non-empty string.`);
  }

  return value.trim();
}

function parsePublishedAt(value: unknown, index: number): Date | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value !== 'string') {
    throw new Error(`music.json entry ${index}: "publishedAt" must be an ISO date string.`);
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`music.json entry ${index}: "publishedAt" is not a valid date: ${value}`);
  }

  return parsed;
}

function parseDeclaredLibraries(value: unknown): MusicLibraryImportEntry[] | null {
  if (value === undefined) {
    return null;
  }

  if (!Array.isArray(value)) {
    throw new Error('music.json: "libraries" must be an array when present.');
  }

  const seen = new Set<string>();

  return value.map((item, index) => {
    if (typeof item !== 'object' || item === null) {
      throw new Error(`music.json library ${index}: must be an object.`);
    }

    const record = item as Record<string, unknown>;
    const key = typeof record.key === 'string' ? record.key.trim() : '';

    if (key === '') {
      throw new Error(`music.json library ${index}: "key" must be a non-empty string.`);
    }

    if (seen.has(key)) {
      throw new Error(`music.json contains a duplicate library key: ${key}`);
    }

    seen.add(key);

    const title = typeof record.title === 'string' ? record.title.trim() : '';

    if (title === '') {
      throw new Error(`music.json library ${key}: "title" must be a non-empty string.`);
    }

    if (typeof record.position !== 'number' || !Number.isInteger(record.position)) {
      throw new Error(`music.json library ${key}: "position" must be an integer.`);
    }

    return { key, title, position: record.position };
  });
}

function parseTrackLibraries(
  value: unknown,
  index: number,
  declaredKeys: Set<string> | null,
): string[] | null {
  if (value === undefined) {
    // 省略字段与显式给空数组含义不同：省略表示隐式 default
    if (declaredKeys !== null && !declaredKeys.has(DEFAULT_LIBRARY_KEY)) {
      throw new Error(
        `music.json entry ${index}: it omits "libraries", which means the "${DEFAULT_LIBRARY_KEY}" library, but that library is not declared.`,
      );
    }

    return null;
  }

  if (!Array.isArray(value)) {
    throw new Error(`music.json entry ${index}: "libraries" must be an array of library keys.`);
  }

  if (value.length === 0) {
    throw new Error(
      `music.json entry ${index}: "libraries" must not be empty; omit the field to use the "${DEFAULT_LIBRARY_KEY}" library.`,
    );
  }

  const keys: string[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (typeof item !== 'string' || item.trim() === '') {
      throw new Error(`music.json entry ${index}: "libraries" must contain non-empty strings.`);
    }

    const key = item.trim();

    if (seen.has(key)) {
      throw new Error(`music.json entry ${index}: "libraries" repeats the library key: ${key}`);
    }

    seen.add(key);

    if (declaredKeys === null) {
      throw new Error(
        `music.json entry ${index}: "libraries" is set on a track but the manifest has no top-level "libraries" array.`,
      );
    }

    if (!declaredKeys.has(key)) {
      throw new Error(`music.json entry ${index}: "libraries" refers to an undeclared library: ${key}`);
    }

    keys.push(key);
  }

  return keys;
}

// 清单契约：trackKey 由清单显式提供，不从文件名或哈希推导；position 是显式整数，允许重复
// （排序由 position ASC, id ASC 兜底）
// trackKey 必须唯一，重复会让 一行一首 语义失效

// libraries 的两个字段在这里只校验、不转换：顶层缺失与单条缺失都保持 null，
// 由 resolveMusicManifest 依据模式决定含义，避免旧清单模式被提前判成权威模式
export function parseMusicManifest(raw: string): MusicManifest {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('music.json is not valid JSON.');
  }

  if (typeof parsed !== 'object' || parsed === null || !Array.isArray((parsed as { tracks?: unknown }).tracks)) {
    throw new Error('music.json must be an object with a "tracks" array.');
  }

  const record = parsed as { tracks: unknown[]; libraries?: unknown };
  const libraries = parseDeclaredLibraries(record.libraries);
  const declaredKeys = libraries === null ? null : new Set(libraries.map((entry) => entry.key));

  const tracks = record.tracks.map((item, index) => {
    if (typeof item !== 'object' || item === null) {
      throw new Error(`music.json entry ${index}: must be an object.`);
    }

    const itemRecord = item as Record<string, unknown>;
    const position = itemRecord.position;

    if (typeof position !== 'number' || !Number.isInteger(position)) {
      throw new Error(`music.json entry ${index}: "position" must be an integer.`);
    }

    const artist = itemRecord.artist;

    if (artist !== undefined && artist !== null && typeof artist !== 'string') {
      throw new Error(`music.json entry ${index}: "artist" must be a string when present.`);
    }

    return {
      trackKey: requireString(itemRecord.trackKey, 'trackKey', index),
      file: requireString(itemRecord.file, 'file', index),
      title: requireString(itemRecord.title, 'title', index),
      artist: typeof artist === 'string' && artist.trim() !== '' ? artist.trim() : null,
      publishedAt: parsePublishedAt(itemRecord.publishedAt, index),
      position,
      libraries: parseTrackLibraries(itemRecord.libraries, index, declaredKeys),
    } satisfies MusicManifestTrackEntry;
  });

  const seen = new Set<string>();

  for (const entry of tracks) {
    if (seen.has(entry.trackKey)) {
      throw new Error(`music.json contains a duplicate trackKey: ${entry.trackKey}`);
    }

    seen.add(entry.trackKey);
  }

  return { libraries, tracks };
}

// 模式判定：顶层没有声明曲库 = 旧清单模式（曲目上不可能有 libraries，解析阶段已保证）
// 权威模式里省略字段的曲目等价于 ['default']
export function resolveMusicManifest(manifest: MusicManifest): ResolvedMusicManifest {
  if (manifest.libraries === null) {
    return {
      mode: 'legacy',
      libraries: null,
      tracks: manifest.tracks.map((entry) => ({ ...entry, libraries: [DEFAULT_LIBRARY_KEY] })),
    };
  }

  return {
    mode: 'authority',
    libraries: manifest.libraries,
    tracks: manifest.tracks.map((entry) => ({
      ...entry,
      libraries: entry.libraries ?? [DEFAULT_LIBRARY_KEY],
    })),
  };
}

// 全量校验通过之后才允许写任何东西：解析内容根、读清单、逐条 inspect（只 stat 不读内容）
export async function planMusicImport({
  manifestPath,
  allowEmpty = false,
}: {
  manifestPath?: string;
  allowEmpty?: boolean;
}): Promise<MusicImportPlan> {
  const contentRoot = await getMusicContentRoot();
  const resolvedManifestPath = manifestPath
    ? path.resolve(manifestPath)
    : path.join(contentRoot, 'music.json');

  const raw = await fs.readFile(resolvedManifestPath, 'utf8').catch(() => {
    throw new Error(`Cannot read the music manifest: ${resolvedManifestPath}`);
  });

  const manifest = resolveMusicManifest(parseMusicManifest(raw));

  // 空清单会停用全部现有曲目与曲库，破坏性操作，显式要求
  if (manifest.tracks.length === 0 && !allowEmpty) {
    throw new Error(
      'music.json contains no tracks. Importing it would deactivate every existing track; pass --allow-empty to do that deliberately.',
    );
  }

  const entries: MusicImportPlanEntry[] = [];

  for (const entry of manifest.tracks) {
    const source = await inspectMusicSource(contentRoot, entry.file);
    entries.push({ ...entry, source });
  }

  return {
    contentRoot,
    manifestPath: resolvedManifestPath,
    mode: manifest.mode,
    libraries: manifest.libraries,
    entries,
  };
}

// 镜像与数据库分两步，数据库部分单事务；返回本次复制了哪些文件
export async function publishMusicImportMedia({
  plan,
  mode,
}: {
  plan: MusicImportPlan;
  mode: MusicMediaMode;
}): Promise<MusicMediaOperation[]> {
  const operations: MusicMediaOperation[] = [];

  for (const entry of plan.entries) {
    operations.push(await publishMusicMedia({ source: entry.source, mode }));
  }

  return operations;
}

export async function commitMusicImport({
  plan,
  operations,
}: {
  plan: MusicImportPlan;
  operations: MusicMediaOperation[];
}): Promise<MusicImportSummary> {
  const dbEntries: MusicTrackImportEntry[] = [];

  for (const [index, entry] of plan.entries.entries()) {
    const operation = operations[index];

    dbEntries.push({
      trackKey: entry.trackKey,
      title: entry.title,
      artist: entry.artist,
      audioUrl: operation.targetUrl,
      contentHash: operation.hash,
      mimeType: operation.mimeType,
      fileSize: operation.size,
      durationSeconds: await readAudioDurationSeconds(entry.source.sourcePath),
      publishedAt: entry.publishedAt,
      position: entry.position,
      libraries: entry.libraries,
    });
  }

  return importMusicCatalog({ libraries: plan.libraries, tracks: dbEntries });
}

// 时长只在导入时读一次并落库
async function readAudioDurationSeconds(sourcePath: string): Promise<number | null> {
  try {
    const metadata = await parseFile(sourcePath);
    const duration = metadata.format.duration;

    if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0) {
      return null;
    }

    return Math.round(duration);
  } catch {
    // 读不到时长不阻断导入：曲目照样能播，列表少一列信息
    return null;
  }
}

export type MusicLibraryConsistencyEntry = Pick<MusicImportPlanEntry, 'trackKey' | 'libraries'>;

export type MusicLibraryConsistencyInput = {
  plan: {
    libraries: MusicLibraryImportEntry[] | null;
    entries: MusicLibraryConsistencyEntry[];
  };
  libraries: MusicLibraryRecord[];
  memberships: MusicLibraryMembershipRecord[];
  tracks: MusicTrackRecord[];
};

// 纯函数：清单与数据库在曲库上的差异，停用的声明库与标题/顺序漂移都算差异
export function inspectMusicLibraryConsistency({
  plan,
  libraries,
  memberships,
  tracks,
}: MusicLibraryConsistencyInput): MusicMirrorIssue[] {
  const issues: MusicMirrorIssue[] = [];
  const libraryByKey = new Map(libraries.map((row) => [row.key, row]));

  if (plan.libraries === null) {
    // 旧清单模式：不停用曲库，只要求 default 存在且启用（导入会建立或重新启用它）
    const implicit = libraryByKey.get(DEFAULT_LIBRARY_KEY);

    if (!implicit) {
      issues.push({ kind: 'libraryNotImported', detail: `${DEFAULT_LIBRARY_KEY} (implicit)` });
    } else if (!implicit.isActive) {
      issues.push({
        kind: 'libraryNotImported',
        detail: `${DEFAULT_LIBRARY_KEY} (inactive; the next import reactivates it)`,
      });
    }
  } else {
    const declaredKeys = new Set(plan.libraries.map((entry) => entry.key));

    for (const entry of plan.libraries) {
      const row = libraryByKey.get(entry.key);

      if (!row) {
        issues.push({ kind: 'libraryNotImported', detail: entry.key });
        continue;
      }

      if (!row.isActive) {
        issues.push({
          kind: 'libraryNotImported',
          detail: `${entry.key} (inactive; the next import reactivates it)`,
        });
        continue;
      }

      const drift: string[] = [];

      if (row.title !== entry.title) {
        drift.push(`title "${row.title}" → "${entry.title}"`);
      }

      if (row.position !== entry.position) {
        drift.push(`position ${row.position} → ${entry.position}`);
      }

      if (drift.length > 0) {
        issues.push({ kind: 'libraryNotImported', detail: `${entry.key} (${drift.join(', ')})` });
      }
    }

    for (const row of libraries) {
      if (row.isActive && !declaredKeys.has(row.key)) {
        issues.push({ kind: 'willDeactivateLibrary', detail: row.key });
      }
    }
  }

  const libraryKeyById = new Map(libraries.map((row) => [row.id, row.key]));
  const trackKeyById = new Map(tracks.map((row) => [row.id, row.trackKey]));
  const libraryKeysByTrackKey = new Map<string, string[]>();

  for (const membership of memberships) {
    const libraryKey = libraryKeyById.get(membership.libraryId);
    const trackKey = trackKeyById.get(membership.trackId);

    if (!libraryKey || !trackKey) continue;

    const keys = libraryKeysByTrackKey.get(trackKey) ?? [];
    keys.push(libraryKey);
    libraryKeysByTrackKey.set(trackKey, keys);
  }

  for (const entry of plan.entries) {
    const expected = [...entry.libraries].sort();
    const actual = [...(libraryKeysByTrackKey.get(entry.trackKey) ?? [])].sort();

    // 旧清单模式只补 default，不删任何成员关系：只报缺失；权威模式按清单整体重写：多一个少一个都报
    const mismatch = plan.libraries === null
      ? expected.some((key) => !actual.includes(key))
      : expected.join('|') !== actual.join('|');

    if (mismatch) {
      issues.push({
        kind: 'membershipMismatch',
        detail: `${entry.trackKey}: manifest has [${expected.join(', ')}], database has [${actual.join(', ')}]`,
      });
    }
  }

  return issues;
}

// 一致性检查：镜像与数据库谁多谁少 / 停用行仍引用自己的镜像，只有"没有任何行引用"的文件才算孤儿
export async function validateMusicMirror({
  plan,
}: {
  plan: MusicImportPlan;
}): Promise<MusicMirrorIssue[]> {
  const issues: MusicMirrorIssue[] = [];

  // 按 trackKey 记录清单算出的期望文件名，用于镜像比对与 URL 交叉校验
  const expectedNameByTrackKey = new Map<string, string>();

  for (const entry of plan.entries) {
    const operation = await publishMusicMedia({ source: entry.source, mode: 'dry-run' });
    expectedNameByTrackKey.set(entry.trackKey, operation.fileName);
  }

  const rows = await listAllMusicTracks();
  const referencedNames = new Set(
    rows
      .map((row) => row.audioUrl.startsWith(`${musicMediaPublicPath}/`)
        ? row.audioUrl.slice(musicMediaPublicPath.length + 1)
        : '')
      .filter((name) => name !== ''),
  );

  const mirrorDirectory = musicMediaMirrorDirectory();
  const mirrorNames: string[] = await fs.readdir(mirrorDirectory).catch(() => []);

  for (const name of mirrorNames) {
    if (!referencedNames.has(name)) {
      issues.push({ kind: 'orphanMirror', detail: name });
    }
  }

  for (const name of referencedNames) {
    if (!mirrorNames.includes(name)) {
      issues.push({ kind: 'missingMirror', detail: name });
    }
  }

  const importedKeys = new Set(rows.map((row) => row.trackKey));

  for (const entry of plan.entries) {
    if (!importedKeys.has(entry.trackKey)) {
      issues.push({ kind: 'notImported', detail: entry.trackKey });
    }
  }

  const manifestKeys = new Set(plan.entries.map((entry) => entry.trackKey));

  for (const row of rows) {
    if (row.isActive && !manifestKeys.has(row.trackKey)) {
      issues.push({ kind: 'willDeactivate', detail: row.trackKey });
    }
  }

  // 期望文件名与数据库记录的 URL 必须一致
  const rowByTrackKey = new Map(rows.map((row) => [row.trackKey, row]));

  for (const entry of plan.entries) {
    const row = rowByTrackKey.get(entry.trackKey);
    const expectedName = expectedNameByTrackKey.get(entry.trackKey);

    if (!row || !expectedName) continue;

    const rowName = row.audioUrl.startsWith(`${musicMediaPublicPath}/`)
      ? row.audioUrl.slice(musicMediaPublicPath.length + 1)
      : '';

    if (rowName !== expectedName) {
      issues.push({
        kind: 'staleAudioUrl',
        detail: `${entry.trackKey}: manifest expects ${expectedName}, database has ${rowName || row.audioUrl}`,
      });
    }
  }

  const libraries = await listAllMusicLibraries();
  const memberships = await listMusicLibraryMemberships();

  issues.push(...inspectMusicLibraryConsistency({ plan, libraries, memberships, tracks: rows }));

  return issues;
}

// 清理入口：只有 <64 位十六进制>.<扩展名> 这类镜像命名才是候选
// 临时文件可能属于正在进行的上传，外部文件不是镜像产物，两者都不碰
const musicMediaFileNamePattern = /^[0-9a-f]{64}\.(mp3|wav|flac)$/u;

export function planMusicMirrorCleanup(input: {
  mirrorNames: string[];
  audioUrls: string[];
}): string[] {
  const referencedNames = new Set(
    input.audioUrls
      .map((url) =>
        url.startsWith(`${musicMediaPublicPath}/`)
          ? url.slice(musicMediaPublicPath.length + 1)
          : '',
      )
      .filter((name) => name !== ''),
  );

  return input.mirrorNames
    .filter((name) => musicMediaFileNamePattern.test(name) && !referencedNames.has(name))
    .sort();
}

export type MusicMirrorCleanupReport = {
  orphans: string[];
  mirrorFiles: number;
  referencedFiles: number;
};

// 读取侧：镜像目录里的文件 vs 全部行（含停用行）引用的 URL
export async function inspectMusicMirrorCleanup(): Promise<MusicMirrorCleanupReport> {
  const rows = await listAllMusicTracks();
  const mirrorNames: string[] = await fs.readdir(musicMediaMirrorDirectory()).catch(() => []);
  const orphans = planMusicMirrorCleanup({
    mirrorNames,
    audioUrls: rows.map((row) => row.audioUrl),
  });

  return {
    orphans,
    mirrorFiles: mirrorNames.length,
    referencedFiles: mirrorNames.length - orphans.length,
  };
}

export async function applyMusicMirrorCleanup(input: {
  orphans: string[];
}): Promise<{ removed: string[]; failed: string[] }> {
  const removed: string[] = [];
  const failed: string[] = [];

  for (const name of input.orphans) {
    const deleted = await removeMusicMediaByUrl(`${musicMediaPublicPath}/${name}`);

    if (deleted) {
      removed.push(name);
    } else {
      failed.push(name);
    }
  }

  return { removed, failed };
}
