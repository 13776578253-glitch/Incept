import {
  listAllMusicLibraries,
  listAllMusicTracks,
  listMusicLibraryMemberships,
} from '@incept/db/music';
import { parseFile } from 'music-metadata';

import { deriveMusicLibraryKey, deriveMusicTrackKey } from './music-key';

export type MusicAdminLibrary = {
  key: string;
  title: string;
  position: number;
  isActive: boolean;
  // 归属该库的曲目数（含停用曲目，界面上要能看见）
  memberCount: number;
};

export type MusicAdminTrack = {
  trackKey: string;
  title: string;
  artist: string | null;
  durationSeconds: number | null;
  publishedAt: string | null;
  libraries: string[];
  position: number;
  isActive: boolean;
};

export type MusicAdminData = {
  status: 'ready' | 'unavailable';
  message: string | null;
  libraries: MusicAdminLibrary[];
  tracks: MusicAdminTrack[];
};

// 管理界面要看到全部行 /含停用，且不依赖内容根：网页是唯一写入路径之后，
// 曲目与曲库的真相在数据库里，播放器那条读取（listActiveMusicCatalog）保持不变。
export async function readMusicAdminData(): Promise<MusicAdminData> {
  try {
    const [tracks, libraries, memberships] = await Promise.all([
      listAllMusicTracks(),
      listAllMusicLibraries(),
      listMusicLibraryMemberships(),
    ]);

    const libraryByKey = new Map(libraries.map((library) => [library.key, library]));
    const keyById = new Map(libraries.map((library) => [library.id, library.key]));
    const libraryOrder = new Map(libraries.map((library, index) => [library.key, index]));
    const librariesByTrackId = new Map<string, string[]>();
    const memberCounts = new Map<string, number>();

    for (const membership of memberships) {
      const key = keyById.get(membership.libraryId);

      if (!key) continue;

      const keys = librariesByTrackId.get(membership.trackId) ?? [];
      keys.push(key);
      librariesByTrackId.set(membership.trackId, keys);
      memberCounts.set(key, (memberCounts.get(key) ?? 0) + 1);
    }

    return {
      status: 'ready',
      message: null,
      libraries: libraries.map((library) => ({
        key: library.key,
        title: library.title,
        position: library.position,
        isActive: library.isActive,
        memberCount: memberCounts.get(library.key) ?? 0,
      })),
      tracks: tracks.map((track) => ({
        trackKey: track.trackKey,
        title: track.title,
        artist: track.artist,
        durationSeconds: track.durationSeconds,
        publishedAt: track.publishedAt ? track.publishedAt.toISOString() : null,
        libraries: [...(librariesByTrackId.get(track.id) ?? [])].sort(
          (left, right) => (libraryOrder.get(left) ?? 0) - (libraryOrder.get(right) ?? 0),
        ),
        position: track.position,
        isActive: track.isActive,
      })),
    };
  } catch (error) {
    return {
      status: 'unavailable',
      message: error instanceof Error ? error.message : String(error),
      libraries: [],
      tracks: [],
    };
  }
}

// 上传后的标签读取：读不到就是 null，界面上再补，绝不因此拒绝一次上传
export async function readUploadedAudioMetadata(storedPath: string): Promise<{
  title: string | null;
  artist: string | null;
  durationSeconds: number | null;
}> {
  try {
    const metadata = await parseFile(storedPath);
    const title = metadata.common.title?.trim();
    const artist = metadata.common.artist?.trim();
    const duration = metadata.format.duration;

    return {
      title: title ? title : null,
      artist: artist ? artist : null,
      durationSeconds:
        typeof duration === 'number' && Number.isFinite(duration) && duration > 0
          ? Math.round(duration)
          : null,
    };
  } catch {
    return { title: null, artist: null, durationSeconds: null };
  }
}

export function trackKeyForUpload(filename: string, existingTrackKeys: string[]): string {
  return deriveMusicTrackKey(filename, new Set(existingTrackKeys));
}

export function libraryKeyForName(name: string, existingLibraryKeys: string[]): string {
  return deriveMusicLibraryKey(name, new Set(existingLibraryKeys));
}
