import { prisma } from '../client';
import { deriveMusicTrackKey } from './keys';
import { assertMusicLibraryAssignments, planMusicTrackCreate, resolveLibraryId } from './manage';
import {
  musicLibrarySelection,
  musicTrackSelection,
  type MusicCatalogTrackRecord,
} from './queries/list';
import type { MusicLibraryRecord, MusicTrackRecord } from './types';

// 网页上传的写入路径：先按 contentHash 精确去重，命中就补归属、否则建行

export type MusicUploadStatus = 'created' | 'existing' | 'membership-added' | 'deactivated';

export type MusicUploadDecision =
  | { kind: 'create' }
  | { kind: 'existing'; track: MusicTrackRecord; libraryKeys: string[] }
  | {
      kind: 'membership-added';
      track: MusicTrackRecord;
      libraryKeys: string[];
      addLibraryKeys: string[];
    }
  | { kind: 'deactivated'; track: MusicTrackRecord; libraryKeys: string[] };

// 曲库按 (position, id) 排序传入，沿用同一顺序
function libraryKeysOf(
  trackId: string,
  libraries: MusicLibraryRecord[],
  memberships: Array<{ libraryId: string; trackId: string }>,
): string[] {
  const memberIds = new Set(
    memberships.filter((membership) => membership.trackId === trackId).map((row) => row.libraryId),
  );

  return libraries.filter((library) => memberIds.has(library.id)).map((library) => library.key);
}

export function planMusicUploadDecision(input: {
  contentHash: string;
  libraryKeys: string[];
  tracks: MusicTrackRecord[];
  libraries: MusicLibraryRecord[];
  memberships: Array<{ libraryId: string; trackId: string }>;
}): MusicUploadDecision {
  const match = input.tracks.find(
    (track) => track.contentHash !== null && track.contentHash === input.contentHash,
  );

  if (!match) {
    return { kind: 'create' };
  }

  const libraryKeys = libraryKeysOf(match.id, input.libraries, input.memberships);

  // 停用行只报告：不自动恢复，也不补归属
  if (!match.isActive) {
    return { kind: 'deactivated', track: match, libraryKeys };
  }

  const libraryIdByKey = new Map(input.libraries.map((library) => [library.key, library.id]));
  const existingKeys = new Set(libraryKeys);
  const addLibraryKeys = input.libraryKeys.filter(
    (key) => !existingKeys.has(key) && libraryIdByKey.has(key),
  );

  if (addLibraryKeys.length === 0) {
    return { kind: 'existing', track: match, libraryKeys };
  }

  const target = new Set([...libraryKeys, ...addLibraryKeys]);

  return {
    kind: 'membership-added',
    track: match,
    libraryKeys: input.libraries.filter((library) => target.has(library.key)).map((library) => library.key),
    addLibraryKeys,
  };
}

export type MusicDuplicateHint = {
  trackKey: string;
  title: string;
  artist: string | null;
  durationSeconds: number | null;
  reason: 'title-duration';
};

const duplicateHintLimit = 5;

// 归一化只用于比较：大小写、空白、标点都不参与
function tokensOf(value: string): string[] {
  const normalized = value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

  return normalized === '' ? [] : normalized.split(/\s+/);
}

function containsTokens(haystack: string[], needle: string[]): boolean {
  if (needle.length >= haystack.length) return false;

  for (let start = 0; start + needle.length <= haystack.length; start += 1) {
    if (needle.every((token, offset) => haystack[start + offset] === token)) return true;
  }

  return false;
}

// 相等，或一方是另一方的连续 token 子串（接住歌手粘进标题的标签）
function textLooksAlike(left: string, right: string): boolean {
  const leftTokens = tokensOf(left);
  const rightTokens = tokensOf(right);

  if (leftTokens.length === 0 || rightTokens.length === 0) return false;
  if (leftTokens.join(' ') === rightTokens.join(' ')) return true;

  return containsTokens(leftTokens, rightTokens) || containsTokens(rightTokens, leftTokens);
}

function artistsLookAlike(left: string | null, right: string | null): boolean {
  // 缺失的一方不参与否决
  if (left === null || right === null) return true;

  return textLooksAlike(left, right);
}

function durationsLookAlike(left: number | null, right: number | null): boolean {
  if (left === null || right === null) return true;

  return Math.abs(left - right) <= Math.max(3, Math.max(left, right) * 0.05);
}

// 疑似重复只提示、绝不合并：标题相近 + 歌手不冲突 + 时长接近才算命中
export function findMusicDuplicateCandidates(
  input: { title: string; artist: string | null; durationSeconds: number | null; contentHash: string },
  tracks: MusicTrackRecord[],
): MusicDuplicateHint[] {
  const hints: MusicDuplicateHint[] = [];

  for (const track of tracks) {
    if (hints.length >= duplicateHintLimit) break;
    if (!track.isActive || track.contentHash === input.contentHash) continue;
    if (!textLooksAlike(track.title, input.title)) continue;
    if (!artistsLookAlike(input.artist, track.artist)) continue;
    if (!durationsLookAlike(input.durationSeconds, track.durationSeconds)) continue;

    hints.push({
      trackKey: track.trackKey,
      title: track.title,
      artist: track.artist,
      durationSeconds: track.durationSeconds,
      reason: 'title-duration',
    });
  }

  return hints;
}

export type MusicUploadOutcome = {
  status: MusicUploadStatus;
  track: MusicCatalogTrackRecord;
  duplicates: MusicDuplicateHint[];
};

const uniqueViolationCode = 'P2002';
// 并发上传同一份内容时重试一次
const uploadAttempts = 2;

export function isMusicUniqueConflict(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === uniqueViolationCode
  );
}

export async function uploadMusicTrack(input: {
  filename: string;
  title: string;
  artist: string | null;
  durationSeconds: number | null;
  audioUrl: string;
  contentHash: string;
  mimeType: string;
  fileSize: number;
  libraryKeys: string[];
}): Promise<MusicUploadOutcome> {
  let lastError: unknown;

  for (let attempt = 0; attempt < uploadAttempts; attempt += 1) {
    try {
      return await runUploadAttempt(input);
    } catch (error) {
      // 并发插入会撞唯一索引（contentHash 或 trackKey）
      if (!isMusicUniqueConflict(error)) throw error;

      lastError = error;
    }
  }

  throw lastError;
}

async function runUploadAttempt(input: {
  filename: string;
  title: string;
  artist: string | null;
  durationSeconds: number | null;
  audioUrl: string;
  contentHash: string;
  mimeType: string;
  fileSize: number;
  libraryKeys: string[];
}): Promise<MusicUploadOutcome> {
  return prisma.$transaction(async (transaction) => {
    const [tracks, libraries, memberships] = await Promise.all([
      transaction.musicTrack.findMany({ select: musicTrackSelection }),
      transaction.musicLibrary.findMany({ select: musicLibrarySelection }),
      transaction.musicLibraryItem.findMany({ select: { libraryId: true, trackId: true } }),
    ]);

    assertMusicLibraryAssignments(input.libraryKeys, libraries);

    const decision = planMusicUploadDecision({
      contentHash: input.contentHash,
      libraryKeys: input.libraryKeys,
      tracks,
      libraries,
      memberships,
    });

    if (decision.kind !== 'create') {
      if (decision.kind === 'membership-added') {
        const libraryIdByKey = new Map(libraries.map((library) => [library.key, library.id]));

        await transaction.musicLibraryItem.createMany({
          data: decision.addLibraryKeys.map((key) => ({
            libraryId: resolveLibraryId(libraryIdByKey, key),
            trackId: decision.track.id,
          })),
        });
      }

      return {
        status: decision.kind,
        track: { ...decision.track, libraries: decision.libraryKeys },
        duplicates: [],
      };
    }

    const trackKey = deriveMusicTrackKey(
      input.filename,
      new Set(tracks.map((track) => track.trackKey)),
    );
    const { position } = planMusicTrackCreate({
      trackKey,
      libraryKeys: input.libraryKeys,
      tracks,
      libraries,
    });
    const libraryIdByKey = new Map(libraries.map((library) => [library.key, library.id]));

    const created = await transaction.musicTrack.create({
      data: {
        trackKey,
        title: input.title.trim(),
        artist: input.artist,
        durationSeconds: input.durationSeconds,
        audioUrl: input.audioUrl,
        contentHash: input.contentHash,
        mimeType: input.mimeType,
        fileSize: input.fileSize,
        position,
        isActive: true,
      },
      select: musicTrackSelection,
    });

    await transaction.musicLibraryItem.createMany({
      data: input.libraryKeys.map((key) => ({
        libraryId: resolveLibraryId(libraryIdByKey, key),
        trackId: created.id,
      })),
    });

    return {
      status: 'created',
      track: { ...created, libraries: [...input.libraryKeys] },
      duplicates: findMusicDuplicateCandidates(
        {
          title: input.title,
          artist: input.artist,
          durationSeconds: input.durationSeconds,
          contentHash: input.contentHash,
        },
        tracks,
      ),
    };
  });
}
