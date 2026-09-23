import {
  toMusicCatalog,
  type MusicCatalog,
  type MusicLibraryCatalogEntry,
  type MusicTrackCatalogEntry,
} from '../react/music-player/adapter/music-source';

export const validCatalogTrack = {
  trackKey: 'demo-01',
  title: '演示曲目 01',
  artist: 'Incept',
  audioUrl: '/_music-media/abc.wav',
  durationSeconds: 268,
  publishedAt: '2026-04-26T00:00:00.000Z',
};

export const validCatalogLibrary = {
  key: 'default',
  title: 'default',
  position: 1,
};

export function makeCatalogPayload(
  overrides: Record<string, unknown> = {},
  libraryOverrides: Record<string, unknown> = {},
) {
  return {
    libraries: [{ ...validCatalogLibrary, ...libraryOverrides }],
    tracks: [{ ...validCatalogTrack, libraries: ['default'], ...overrides }],
  };
}

export function makeCatalog(count = 3, libraryKey = 'default'): MusicCatalog {
  return toMusicCatalog({
    libraries: [
      libraryKey === validCatalogLibrary.key
        ? { ...validCatalogLibrary }
        : { key: libraryKey, title: libraryKey, position: 1 },
    ],
    tracks: Array.from({ length: count }, (_, index) => {
      const ordinal = String(index + 1).padStart(2, '0');

      return {
        ...validCatalogTrack,
        trackKey: `demo-${ordinal}`,
        title: `演示曲目 ${ordinal}`,
        audioUrl: `/_music-media/track-${ordinal}.wav`,
        libraries: [libraryKey],
      };
    }),
  });
}

// 两个曲库 + 一首双归属曲目，用于过滤与切换测试
export function makeMixedCatalog(): MusicCatalog {
  return toMusicCatalog({
    libraries: [
      { key: '播客', title: '播客', position: 1 },
      { key: '音乐', title: '音乐', position: 2 },
    ],
    tracks: [
      {
        ...validCatalogTrack,
        trackKey: 'pod-01',
        title: '第一集',
        audioUrl: '/_music-media/pod-01.wav',
        libraries: ['播客'],
      },
      {
        ...validCatalogTrack,
        trackKey: 'music-01',
        title: '曲一',
        audioUrl: '/_music-media/music-01.wav',
        libraries: ['音乐'],
      },
      {
        ...validCatalogTrack,
        trackKey: 'both-01',
        title: '都要',
        audioUrl: '/_music-media/both-01.wav',
        libraries: ['播客', '音乐'],
      },
    ],
  });
}

export type { MusicCatalog, MusicLibraryCatalogEntry, MusicTrackCatalogEntry };
