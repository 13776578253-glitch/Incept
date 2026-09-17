import fs from 'node:fs/promises';
import path from 'node:path';

import { importMusicTracks, listAllMusicTracks } from '@incept/db/music';
import type { MusicImportSummary, MusicTrackImportEntry } from '@incept/db/music';

import { parseFile } from 'music-metadata';

import { findRepoRoot } from '../../features/docs/importer/paths';
import { getMusicContentRoot } from './content-root';
import { inspectMusicSource, musicMediaPublicPath, publishMusicMedia } from './media-store';
import type { MusicMediaMode, MusicMediaOperation, MusicSourceInfo } from './media-store';

export type MusicManifestEntry = {
  trackKey: string;
  file: string;
  title: string;
  artist: string | null;
  publishedAt: Date | null;
  position: number;
};

export type MusicImportPlanEntry = MusicManifestEntry & {
  source: MusicSourceInfo;
};

export type MusicImportPlan = {
  contentRoot: string;
  manifestPath: string;
  entries: MusicImportPlanEntry[];
};

export type MusicMirrorIssue = {
  kind: 'orphanMirror' | 'missingMirror' | 'notImported' | 'willDeactivate' | 'staleAudioUrl';
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

// 清单契约：trackKey 由清单显式提供，不从文件名或哈希推导；position 是显式整数，允许重复
// （排序由 position ASC, id ASC 兜底）
// trackKey 必须唯一，重复会让"一行一首"的语义失效
export function parseMusicManifest(raw: string): MusicManifestEntry[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('music.json is not valid JSON.');
  }

  if (typeof parsed !== 'object' || parsed === null || !Array.isArray((parsed as { tracks?: unknown }).tracks)) {
    throw new Error('music.json must be an object with a "tracks" array.');
  }

  const entries = (parsed as { tracks: unknown[] }).tracks.map((item, index) => {
    if (typeof item !== 'object' || item === null) {
      throw new Error(`music.json entry ${index}: must be an object.`);
    }

    const record = item as Record<string, unknown>;
    const position = record.position;

    if (typeof position !== 'number' || !Number.isInteger(position)) {
      throw new Error(`music.json entry ${index}: "position" must be an integer.`);
    }

    const artist = record.artist;

    if (artist !== undefined && artist !== null && typeof artist !== 'string') {
      throw new Error(`music.json entry ${index}: "artist" must be a string when present.`);
    }

    return {
      trackKey: requireString(record.trackKey, 'trackKey', index),
      file: requireString(record.file, 'file', index),
      title: requireString(record.title, 'title', index),
      artist: typeof artist === 'string' && artist.trim() !== '' ? artist.trim() : null,
      publishedAt: parsePublishedAt(record.publishedAt, index),
      position,
    } satisfies MusicManifestEntry;
  });

  const seen = new Set<string>();

  for (const entry of entries) {
    if (seen.has(entry.trackKey)) {
      throw new Error(`music.json contains a duplicate trackKey: ${entry.trackKey}`);
    }

    seen.add(entry.trackKey);
  }

  return entries;
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

  const manifestEntries = parseMusicManifest(raw);

  // 空清单会停用全部现有曲目，属于破坏性操作，必须显式要求。
  if (manifestEntries.length === 0 && !allowEmpty) {
    throw new Error(
      'music.json contains no tracks. Importing it would deactivate every existing track; pass --allow-empty to do that deliberately.',
    );
  }

  const entries: MusicImportPlanEntry[] = [];

  for (const entry of manifestEntries) {
    const source = await inspectMusicSource(contentRoot, entry.file);
    entries.push({ ...entry, source });
  }

  return { contentRoot, manifestPath: resolvedManifestPath, entries };
}

// 镜像与数据库分成两步：数据库写失败时，调用方仍需持有本次复制了哪些文件的清单。
// 数据库部分在单个事务里；镜像部分内容寻址，重复运行必然复用。
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
    });
  }

  return importMusicTracks(dbEntries);
}

// 时长只在导入时读一次并落库：列表需要在音频加载之前就知道它，
// 而浏览器要等元数据加载完才拿得到，所以不能靠运行时补。
async function readAudioDurationSeconds(sourcePath: string): Promise<number | null> {
  try {
    const metadata = await parseFile(sourcePath);
    const duration = metadata.format.duration;

    if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0) {
      return null;
    }

    return Math.round(duration);
  } catch {
    // 读不到时长不阻断导入：曲目照样能播，只是列表少一列信息。
    return null;
  }
}

// 一致性检查：镜像与数据库谁多谁少。停用行仍引用自己的镜像，所以只有"没有任何行引用"的文件才算孤儿
export async function validateMusicMirror({
  plan,
}: {
  plan: MusicImportPlan;
}): Promise<MusicMirrorIssue[]> {
  const issues: MusicMirrorIssue[] = [];

  // 按 trackKey 记录清单算出的期望文件名：它既要参与镜像比对，
  // 也要与数据库记录的 URL 交叉校验，因此不能只收集成集合。
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

  const mirrorDirectory = path.join(
    findRepoRoot(),
    'apps',
    'web',
    'public',
    '_music-media',
  );
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

  // 清单算出的期望文件名必须与数据库记录的 URL 一致。不一致说明内容换了但 trackKey 没换，
  // 属于契约违反，而且播放器会继续发出旧字节。
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

  return issues;
}
