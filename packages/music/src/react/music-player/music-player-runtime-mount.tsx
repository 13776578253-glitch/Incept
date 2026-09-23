'use client';

import { useEffect, useMemo, type ReactNode } from 'react';

import { useMusicPlayerPreferences } from '../preferences/use-music-player-preferences';

import {
  filterCatalogByLibrary,
  resolveLibrarySelection,
} from './adapter/music-source';
import { useMusicTrackCatalog } from './hooks/use-music-track-catalog';
import { MusicPlayerProvider } from './runtime/music-player-provider';

type MusicPlayerRuntimeMountProps = {
  children: ReactNode;
};

// 目录加载与 core 初始化都在这里：放进 layout 会导致 SSR/CSR 不一致
export function MusicPlayerRuntimeMount({ children }: MusicPlayerRuntimeMountProps) {
  const { entries, libraries, status, reload } = useMusicTrackCatalog();
  const {
    selectedLibrary,
    setSelectedLibrary,
    isReady: isPreferenceReady,
  } = useMusicPlayerPreferences();

  // 切换曲库就是换一次队列：过滤后的目录交给 provider
  const effectiveSelection = resolveLibrarySelection(libraries, selectedLibrary);
  const visibleEntries = useMemo(
    () => filterCatalogByLibrary(entries, effectiveSelection),
    [entries, effectiveSelection],
  );

  // 目录就绪后自愈：偏好里的库已删或改名就清掉
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
