import {
  listAllMusicLibraries,
  listAllMusicTracks,
  listMusicLibraryMemberships,
} from '../adapters';

import { deriveMusicLibraryKey } from '../domain';

export type MusicAdminLibrary = {
  key: string;
  title: string;
  position: number;
  isActive: boolean;
  memberCount: number;   // 归属该库的曲目数 /含停用曲目
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

// 管理界面看全部行（含停用）；真相在数据库，不依赖内容根
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

export function libraryKeyForName(name: string, existingLibraryKeys: string[]): string {
  return deriveMusicLibraryKey(name, new Set(existingLibraryKeys));
}
