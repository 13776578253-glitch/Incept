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
//
// 列表刻意造到 27 条（与参考图的条目量一致），用来验证长列表的滚动与行高；
// 但只生成 3 段真实音频，按索引轮转复用——列表长度和音频资源数是两件事。
const MOCK_TRACK_COUNT = 27;

const MOCK_AUDIO_FILES = [
  '/mock/audio/mock-track-01.wav',
  '/mock/audio/mock-track-02.wav',
  '/mock/audio/mock-track-03.wav',
];

const MOCK_AUDIO_LABELS = ['A3 220 Hz', 'C#4 277 Hz', 'E4 330 Hz'];

const MOCK_AUDIO_DURATIONS = [6, 8, 10];

// 与参考图一致：日期自 2026-04-26 起按固定步长递减，纯 UTC 运算以保证结果稳定。
function buildMockPublishedAt(index: number): string {
  const dayInMilliseconds = 24 * 60 * 60 * 1000;
  const date = new Date(Date.UTC(2026, 3, 26) - index * 11 * dayInMilliseconds);
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dayOfMonth = String(date.getUTCDate()).padStart(2, '0');

  return `${date.getUTCFullYear()}-${month}-${dayOfMonth}`;
}

const mockTrackRows: PlayerTrackRow[] = Array.from({ length: MOCK_TRACK_COUNT }, (_unused, index) => {
  const ordinal = String(index + 1).padStart(2, '0');
  const audioIndex = index % MOCK_AUDIO_FILES.length;

  return {
    track: {
      id: `mock-${ordinal}`,
      title: `Sample Track ${ordinal} · ${MOCK_AUDIO_LABELS[audioIndex]}`,
      artist: 'Mock Audio',
      durationHint: MOCK_AUDIO_DURATIONS[audioIndex],
    },
    publishedAt: buildMockPublishedAt(index),
  };
});

const audioUrlByTrackId: Record<string, string> = Object.fromEntries(
  mockTrackRows.map((row, index) => [row.track.id, MOCK_AUDIO_FILES[index % MOCK_AUDIO_FILES.length]]),
);

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
