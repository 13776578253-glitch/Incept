import type { MusicTrack } from '@incept/music-player-core';

export type PlayerTrackRow = {
  track: MusicTrack;
  publishedAt: string;
};

export type ResolvedTrackSource = {
  audioUrl: string;
  artworkUrl?: string;
};

// 本期只提供 mock 音源：core 不持有可播放 URL，资源解析一律留在这里。
const mockTrackRows: PlayerTrackRow[] = [
  {
    track: { id: 'mock-01', title: 'Sample Track 01 · A3 220 Hz', artist: 'Mock Audio', durationHint: 6 },
    publishedAt: '2026-04-26',
  },
  {
    track: { id: 'mock-02', title: 'Sample Track 02 · C#4 277 Hz', artist: 'Mock Audio', durationHint: 8 },
    publishedAt: '2026-03-22',
  },
  {
    track: { id: 'mock-03', title: 'Sample Track 03 · E4 330 Hz', artist: 'Mock Audio', durationHint: 10 },
    publishedAt: '2026-01-17',
  },
];

const audioUrlByTrackId: Record<string, string> = {
  'mock-01': '/mock/audio/mock-track-01.wav',
  'mock-02': '/mock/audio/mock-track-02.wav',
  'mock-03': '/mock/audio/mock-track-03.wav',
};

const publishedAtByTrackId: Record<string, string> = Object.fromEntries(
  mockTrackRows.map((row) => [row.track.id, row.publishedAt]),
);

// 列表行右侧的日期是站点侧字段，只存在于 adapter，不进 core。
export function getTrackPublishedAt(trackId: string): string | undefined {
  return publishedAtByTrackId[trackId];
}

export const mockMusicTracks: MusicTrack[] = mockTrackRows.map((row) => row.track);

export const mockMusicTrackRows: PlayerTrackRow[] = [...mockTrackRows];

export async function resolveTrackSource(trackId: string): Promise<ResolvedTrackSource> {
  const audioUrl = audioUrlByTrackId[trackId];

  if (!audioUrl) {
    throw new Error('mock_source_unavailable');
  }

  return { audioUrl };
}
