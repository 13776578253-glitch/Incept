'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  toMusicCatalog,
  type MusicCatalog,
  type MusicLibraryCatalogEntry,
  type MusicTrackCatalogEntry,
} from '../adapter/music-source';

// 目录状态属于数据层，不写入 core 的错误字段
export type TrackCatalogStatus = 'loading' | 'ready' | 'error';

export type MusicTrackCatalog = {
  entries: MusicTrackCatalogEntry[];
  libraries: MusicLibraryCatalogEntry[];
  status: TrackCatalogStatus;
  reload: () => void;
};

const EMPTY_CATALOG: MusicCatalog = { libraries: [], entries: [] };

export function useMusicTrackCatalog(): MusicTrackCatalog {
  const [catalog, setCatalog] = useState<MusicCatalog>(EMPTY_CATALOG);
  const [status, setStatus] = useState<TrackCatalogStatus>('loading');
  const [requestId, setRequestId] = useState(0);

  // 重试入口：只重新请求目录，不清空已有数据
  const reload = useCallback(() => {
    setStatus('loading');
    setRequestId((current) => current + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    void fetch('/api/music/tracks', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`music catalogue request failed with ${response.status}`);
        }

        return response.json();
      })
      .then((payload: unknown) => {
        setCatalog(toMusicCatalog(payload));
        setStatus('ready');
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;

        // 只改状态，不派发任何 core 输入
        setStatus('error');
        console.error('[music-player] track catalogue request failed', error);
      });

    return () => controller.abort();
  }, [requestId]);

  return { entries: catalog.entries, libraries: catalog.libraries, status, reload };
}
