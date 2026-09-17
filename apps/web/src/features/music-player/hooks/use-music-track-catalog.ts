'use client';

import { useCallback, useEffect, useState } from 'react';

import { toCatalogEntries, type MusicTrackCatalogEntry } from '../adapter/music-source';

// 目录状态属于数据层：不等于音频播放状态，不写入 core 的错误字段
// 若把目录失败压进 core，故障来源就会和"当前音频加载失败"混在一起
export type TrackCatalogStatus = 'loading' | 'ready' | 'error';

export type MusicTrackCatalog = {
  entries: MusicTrackCatalogEntry[];
  status: TrackCatalogStatus;
  reload: () => void;
};

export function useMusicTrackCatalog(): MusicTrackCatalog {
  const [entries, setEntries] = useState<MusicTrackCatalogEntry[]>([]);
  const [status, setStatus] = useState<TrackCatalogStatus>('loading');
  const [requestId, setRequestId] = useState(0);

  // 重试入口：瞬时故障不必重新加载页面
  // 重试不会清空 entries：队列因此保持不变，正在播放的曲目也不受影响；成功后得到新的数组引用，音源应用逻辑识别为"没有变化"
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
        setEntries(toCatalogEntries(payload));
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

  return { entries, status, reload };
}
