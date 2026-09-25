import {
  importMusicCatalog,
  inspectMusicSource,
  listAllMusicLibraries,
  listAllMusicTracks,
  listMusicLibraryMemberships,
  listMusicMirrorNames,
  publishMusicMedia,
  readAudioDurationSeconds,
  readMusicManifestRaw,
  removeMusicMediaByUrl,
  resolveMusicManifestPath,
} from '../adapters';
import {
  inspectMusicLibraryConsistency,
  parseMusicManifest,
  planMusicMirrorCleanup,
  resolveMusicManifest,
} from '../domain/import-runner';
import type {
  MusicImportPlan,
  MusicImportPlanEntry,
  MusicMirrorCleanupReport,
  MusicMirrorIssue,
} from '../domain/import-runner';
import { musicMediaPublicPath } from '../domain/media';
import type { MusicMediaMode, MusicMediaOperation } from '../domain/media';
import type { MusicImportSummary, MusicTrackImportEntry } from '../domain/types';
import type { MusicContentRootPort, MusicMirrorPort } from '../ports';

// import-runner 用例编排：纯解析与纯校验在 ../domain/import-runner，路径一律由装配层注入（决策 5）
// history: 原 apps/web/src/server/music/import-runner.ts 拆分纯校验入 domain，编排留本层

// 全量校验通过之后才允许写任何东西：解析内容根、读清单、逐条 inspect（只 stat 不读内容）
export async function planMusicImport({
  paths,
  manifestPath,
  allowEmpty = false,
}: {
  paths: MusicContentRootPort;
  manifestPath?: string;
  allowEmpty?: boolean;
}): Promise<MusicImportPlan> {
  const contentRoot = paths.contentRoot;
  const resolvedManifestPath = resolveMusicManifestPath(contentRoot, manifestPath);
  const raw = await readMusicManifestRaw(resolvedManifestPath);

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
  paths,
  plan,
  mode,
}: {
  paths: MusicMirrorPort;
  plan: MusicImportPlan;
  mode: MusicMediaMode;
}): Promise<MusicMediaOperation[]> {
  const operations: MusicMediaOperation[] = [];

  for (const entry of plan.entries) {
    operations.push(
      await publishMusicMedia({ source: entry.source, mode, directory: paths.mirrorDirectory }),
    );
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

// 一致性检查：镜像与数据库谁多谁少 / 停用行仍引用自己的镜像，只有"没有任何行引用"的文件才算孤儿
export async function validateMusicMirror({
  paths,
  plan,
}: {
  paths: MusicMirrorPort;
  plan: MusicImportPlan;
}): Promise<MusicMirrorIssue[]> {
  const issues: MusicMirrorIssue[] = [];

  // 按 trackKey 记录清单算出的期望文件名，用于镜像比对与 URL 交叉校验
  const expectedNameByTrackKey = new Map<string, string>();

  for (const entry of plan.entries) {
    const operation = await publishMusicMedia({
      source: entry.source,
      mode: 'dry-run',
      directory: paths.mirrorDirectory,
    });
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

  const mirrorDirectory = paths.mirrorDirectory;
  const mirrorNames: string[] = await listMusicMirrorNames(mirrorDirectory);

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

// 读取侧：镜像目录里的文件 vs 全部行（含停用行）引用的 URL
export async function inspectMusicMirrorCleanup({
  paths,
}: {
  paths: MusicMirrorPort;
}): Promise<MusicMirrorCleanupReport> {
  const rows = await listAllMusicTracks();
  const mirrorNames: string[] = await listMusicMirrorNames(paths.mirrorDirectory);
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

export async function applyMusicMirrorCleanup({
  paths,
  orphans,
}: {
  paths: MusicMirrorPort;
  orphans: string[];
}): Promise<{ removed: string[]; failed: string[] }> {
  const removed: string[] = [];
  const failed: string[] = [];

  for (const name of orphans) {
    const deleted = await removeMusicMediaByUrl(
      `${musicMediaPublicPath}/${name}`,
      paths.mirrorDirectory,
    );

    if (deleted) {
      removed.push(name);
    } else {
      failed.push(name);
    }
  }

  return { removed, failed };
}
