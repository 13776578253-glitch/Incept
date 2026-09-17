import type { MusicTrack } from '@incept/music-player-core';

// 目录条目：core 只认识 MusicTrack，发布日期与可播放 URL 是站点侧字段，留在 adapter，与列表行右侧的日期同源
export type MusicTrackCatalogEntry = {
  track: MusicTrack;
  audioUrl: string;
  publishedAt: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// 音源只接受站内相对路径或 https 绝对地址：站外 http、data: 与 javascript: 都不写进 <audio>.src
function isUsableAudioUrl(value: string): boolean {
  return value.startsWith('/') || value.startsWith('https://');
}

// 接口响应属于外部输入，逐字段校验通过后才进入应用，与 db 包对 JSON 字段的要求一致
export function toCatalogEntries(payload: unknown): MusicTrackCatalogEntry[] {
  if (!isRecord(payload) || !Array.isArray(payload.tracks)) {
    throw new Error('music catalogue response must be an object with a tracks array');
  }

  const seenTrackKeys = new Set<string>();

  return payload.tracks.map((item, index) => {
    if (!isRecord(item)) {
      throw new Error(`music catalogue track ${index} is not an object`);
    }

    const trackKey = typeof item.trackKey === 'string' ? item.trackKey.trim() : '';
    const title = typeof item.title === 'string' ? item.title.trim() : '';
    const audioUrl = typeof item.audioUrl === 'string' ? item.audioUrl.trim() : '';

    if (trackKey === '' || title === '' || audioUrl === '') {
      throw new Error(`music catalogue track ${index} must carry trackKey, title and audioUrl`);
    }

    if (seenTrackKeys.has(trackKey)) {
      throw new Error(`music catalogue carries a duplicate trackKey: ${trackKey}`);
    }

    seenTrackKeys.add(trackKey);

    if (!isUsableAudioUrl(audioUrl)) {
      throw new Error(`music catalogue track ${trackKey} has an unusable audioUrl: ${audioUrl}`);
    }

    const artist = typeof item.artist === 'string' && item.artist.trim() !== ''
      ? item.artist.trim()
      : undefined;

    let durationHint: number | undefined;

    if (item.durationSeconds !== null && item.durationSeconds !== undefined) {
      const duration = item.durationSeconds;

      if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0) {
        throw new Error(`music catalogue track ${trackKey} has an unusable durationSeconds`);
      }

      durationHint = duration;
    }

    let publishedAt: string | null = null;

    if (item.publishedAt !== null && item.publishedAt !== undefined && item.publishedAt !== '') {
      const reportedDate = item.publishedAt;

      if (typeof reportedDate !== 'string' || Number.isNaN(Date.parse(reportedDate))) {
        throw new Error(`music catalogue track ${trackKey} has an unparsable publishedAt`);
      }

      publishedAt = reportedDate;
    }

    return {
      track: { id: trackKey, title, artist, durationHint },
      audioUrl,
      publishedAt,
    };
  });
}

export function toMusicTracks(entries: MusicTrackCatalogEntry[]): MusicTrack[] {
  return entries.map((entry) => entry.track);
}

// history：音源查找取代了先前的异步解析接缝：数据库已经保存站点 URL，再解析一次是多余的间接层
// 查不到返回 null，由调用方决定如何处理：目录缺项不会上升为音频播放错误
export function findCatalogAudioUrl(
  entries: MusicTrackCatalogEntry[],
  trackId: string,
): string | null {
  return entries.find((entry) => entry.track.id === trackId)?.audioUrl ?? null;
}

export function findCatalogPublishedAt(
  entries: MusicTrackCatalogEntry[],
  trackId: string,
): string | null {
  return entries.find((entry) => entry.track.id === trackId)?.publishedAt ?? null;
}

export type SourceChange = 'unchanged' | 'applied' | 'replaced';

export function resolveSourceChange(
  previous: { trackId: string | null; audioUrl: string | null },
  next: { trackId: string; audioUrl: string },
): SourceChange {
  if (previous.trackId === next.trackId && previous.audioUrl === next.audioUrl) {
    return 'unchanged';
  }

  // 同一个 trackId 换了 URL 表示内容被替换，由调用方按从头重播处理
  return previous.trackId === next.trackId ? 'replaced' : 'applied';
}
