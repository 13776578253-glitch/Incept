import { prisma } from '@incept/db';
import {
  assertMusicLibraryAssignments,
  deriveMusicTrackKey,
  findMusicDuplicateCandidates,
  isMusicUniqueConflict,
  musicLibrarySelection,
  musicTrackSelection,
  planMusicTrackCreate,
  planMusicUploadDecision,
  resolveLibraryId,
  type MusicUploadOutcome,
} from '../../domain';

// upload 的 Prisma 执行侧（原 packages/db/src/music/upload.ts 拆分而来）：纯规划与去重提示在 ../../domain/upload.ts
// 并发上传同一份内容时重试一次
const uploadAttempts = 2;

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
