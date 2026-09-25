import type { MusicTrack } from '../../../core';

export type MusicLibraryCatalogEntry = {
  key: string;
  title: string;
  position: number;
};

// 目录条目：core 只认识 MusicTrack；发布日期、可播放 URL 与曲库归属是站点侧字段
export type MusicTrackCatalogEntry = {
  track: MusicTrack;
  audioUrl: string;
  publishedAt: string | null;
  // 该曲目所属的曲库 key，顺序与曲库列表一致
  libraries: string[];
};

export type MusicCatalog = {
  libraries: MusicLibraryCatalogEntry[];
  entries: MusicTrackCatalogEntry[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// 音源只接受站内相对路径或 https 绝对地址：站外 http、data: 与 javascript: 都不写进 <audio>.src
function isUsableAudioUrl(value: string): boolean {
  return value.startsWith('/') || value.startsWith('https://');
}

function toLibraryEntries(value: unknown): MusicLibraryCatalogEntry[] {
  if (!Array.isArray(value)) {
    throw new Error('music catalogue response must be an object with a libraries array');
  }

  const seenKeys = new Set<string>();

  return value.map((item, index) => {
    if (!isRecord(item)) {
      throw new Error(`music catalogue library ${index} is not an object`);
    }

    const key = typeof item.key === 'string' ? item.key.trim() : '';
    const title = typeof item.title === 'string' ? item.title.trim() : '';

    if (key === '' || title === '') {
      throw new Error(`music catalogue library ${index} must carry key and title`);
    }

    if (seenKeys.has(key)) {
      throw new Error(`music catalogue carries a duplicate library key: ${key}`);
    }

    seenKeys.add(key);

    if (typeof item.position !== 'number' || !Number.isInteger(item.position)) {
      throw new Error(`music catalogue library ${key} has an unusable position`);
    }

    return { key, title, position: item.position };
  });
}

function toTrackLibraries(value: unknown, trackKey: string, declaredKeys: Set<string>): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`music catalogue track ${trackKey} must carry a libraries array`);
  }

  const keys: string[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (typeof item !== 'string' || item.trim() === '') {
      throw new Error(`music catalogue track ${trackKey} has an unusable library key`);
    }

    const key = item.trim();

    if (seen.has(key)) {
      throw new Error(`music catalogue track ${trackKey} repeats the library key: ${key}`);
    }

    if (!declaredKeys.has(key)) {
      throw new Error(`music catalogue track ${trackKey} refers to an undeclared library: ${key}`);
    }

    seen.add(key);
    keys.push(key);
  }

  return keys;
}

// 接口响应属于外部输入，逐字段校验通过后才进入应用
export function toMusicCatalog(payload: unknown): MusicCatalog {
  if (!isRecord(payload) || !Array.isArray(payload.tracks)) {
    throw new Error('music catalogue response must be an object with a tracks array');
  }

  const libraries = toLibraryEntries(payload.libraries);
  const declaredKeys = new Set(libraries.map((library) => library.key));
  const seenTrackKeys = new Set<string>();

  const entries = payload.tracks.map((item, index) => {
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
      libraries: toTrackLibraries(item.libraries, trackKey, declaredKeys),
    };
  });

  return { libraries, entries };
}

export function toMusicTracks(entries: MusicTrackCatalogEntry[]): MusicTrack[] {
  return entries.map((entry) => entry.track);
}

// null = "全部"视图，它不是曲库
export function filterCatalogByLibrary(
  entries: MusicTrackCatalogEntry[],
  libraryKey: string | null,
): MusicTrackCatalogEntry[] {
  if (libraryKey === null) {
    return entries;
  }

  return entries.filter((entry) => entry.libraries.includes(libraryKey));
}

// 存储的库已删或改名：回到"全部"，由调用方据此清理偏好
export function resolveLibrarySelection(
  libraries: MusicLibraryCatalogEntry[],
  storedKey: string | null,
): string | null {
  if (storedKey === null) {
    return null;
  }

  return libraries.some((library) => library.key === storedKey) ? storedKey : null;
}

// 按曲目 id 在目录里查音频 URL
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
