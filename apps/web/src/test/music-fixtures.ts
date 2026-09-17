import {
  toCatalogEntries,
  type MusicTrackCatalogEntry,
} from '@/features/music-player/adapter/music-source';

export const validCatalogTrack = {
  trackKey: 'demo-01',
  title: '演示曲目 01',
  artist: 'Incept',
  audioUrl: '/_music-media/abc.wav',
  durationSeconds: 268,
  publishedAt: '2026-04-26T00:00:00.000Z',
};

export function makeCatalogPayload(overrides: Record<string, unknown> = {}) {
  return { tracks: [{ ...validCatalogTrack, ...overrides }] };
}

export function makeCatalogEntries(count = 3): MusicTrackCatalogEntry[] {
  const tracks = Array.from({ length: count }, (_, index) => {
    const ordinal = String(index + 1).padStart(2, '0');

    return {
      ...validCatalogTrack,
      trackKey: `demo-${ordinal}`,
      title: `演示曲目 ${ordinal}`,
      audioUrl: `/_music-media/track-${ordinal}.wav`,
    };
  });

  return toCatalogEntries({ tracks });
}
