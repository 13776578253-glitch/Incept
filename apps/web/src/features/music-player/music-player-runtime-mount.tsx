'use client';

import { useEffect, useMemo, type ReactNode } from 'react';

import { useMusicPlayerPreferences } from '@/hooks/use-music-player-preferences';

import {
  filterCatalogByLibrary,
  resolveLibrarySelection,
} from './adapter/music-source';
import { useMusicTrackCatalog } from './hooks/use-music-track-catalog';
import { MusicPlayerProvider } from './runtime/music-player-provider';

type MusicPlayerRuntimeMountProps = {
  children: ReactNode;
};

// 目录加载与 core 初始化都在 runtime mount 里完成，避免在 layout 里加载目录导致的 SSR/CSR 不一致
export function MusicPlayerRuntimeMount({ children }: MusicPlayerRuntimeMountProps) {
  const { entries, libraries, status, reload } = useMusicTrackCatalog();
  const {
    selectedLibrary,
    setSelectedLibrary,
    isReady: isPreferenceReady,
  } = useMusicPlayerPreferences();

  // 切换曲库就是换一次队列：过滤后的目录交给 provider，它会派发 tracksLoaded，core 不需要新输入
  const effectiveSelection = resolveLibrarySelection(libraries, selectedLibrary);
  const visibleEntries = useMemo(
    () => filterCatalogByLibrary(entries, effectiveSelection),
    [entries, effectiveSelection],
  );

  // 目录就绪后自愈：偏好里记着的库已经被删除或改名时清掉它。
  // 必须等目录成功加载（否则初始的空数组会覆盖用户偏好），也必须写回存储，否则旧 key 会一直留着，
  // 将来出现同名库时会意外恢复这个选择。
  useEffect(() => {
    if (!isPreferenceReady || status !== 'ready') return;
    if (selectedLibrary !== null && effectiveSelection === null) {
      setSelectedLibrary(null);
    }
  }, [isPreferenceReady, status, selectedLibrary, effectiveSelection, setSelectedLibrary]);

  return (
    <MusicPlayerProvider
      catalog={visibleEntries}
      libraries={libraries}
      catalogStatus={status}
      onReloadCatalog={reload}
    >
      {children}
    </MusicPlayerProvider>
  );
}
