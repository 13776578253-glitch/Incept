'use client';

import { usePathname } from 'next/navigation';
import { useLocale } from 'next-intl';
import { useEffect, useMemo } from 'react';

import {
  formatClock,
  formatPlaybackRate,
  formatTrackDate,
  getNextPlaybackRate,
  getPlayerCopy,
} from '../adapter/player-copy';
import { findCatalogPublishedAt } from '../adapter/music-source';
import { isMusicPlayerHiddenRoute } from '../adapter/player-route-policy';
import { useFloatingPosition } from '../hooks/use-floating-position';
import { useMusicPlayer } from '../hooks/use-music-player';
import { usePlayerViewport } from '../hooks/use-player-viewport';
import { PlayerCompact } from './player-compact';
import { PlayerExpanded } from './player-expanded';
import { PlayerOrb } from './player-orb';
import type { PlayerPlaylistItem } from './player-playlist';

export function MusicPlayerFloating() {
  const pathname = usePathname();
  const locale = useLocale();
  const copy = useMemo(() => getPlayerCopy(locale), [locale]);
  const { state, sendIntent, playTrack, reloadCatalog, currentTrack, errorKind, catalog, catalogStatus } =
    useMusicPlayer();
  const { mode: viewport, isReady: isViewportReady } = usePlayerViewport();

  const isMobile = viewport === 'mobile';
  const isHiddenRoute = isMusicPlayerHiddenRoute(pathname);

  const { elementRef, placement, geometry, isDragging, setMode, dragHandlers } = useFloatingPosition({
    draggable: !isMobile,
    isReadyToPosition: isViewportReady,
  });

  const viewMode = isMobile && placement.mode === 'orb' ? 'compact' : placement.mode;
  const isPlaying = state.status === 'playing';

  const title =
    currentTrack?.title ?? (catalogStatus === 'loading' ? copy.catalogLoading : copy.emptyQueue);
  const clock = formatClock(state.duration > 0 ? state.duration : currentTrack?.durationHint ?? 0);
  const rateLabel = formatPlaybackRate(state.playbackRate);
  const heading = copy.formatPlaylistHeading(state.queue.length);

  const items = useMemo<PlayerPlaylistItem[]>(
    () =>
      state.queue.map((track) => {
        const publishedAt = findCatalogPublishedAt(catalog, track.id);

        return {
          id: track.id,
          title: track.title,
          meta: publishedAt ? formatTrackDate(locale, publishedAt) : formatClock(track.durationHint ?? 0),
          isCurrent: track.id === state.currentTrackId,
        };
      }),
    [catalog, locale, state.queue, state.currentTrackId],
  );

  // 工具型页面不显示播放器，所以必须在这里把声音停掉——否则用户会听到音乐却没有控件可停。
  // 只暂停、不重置：currentTime 与 restartToken 都不动，回到普通页面按播放是从原进度继续。
  useEffect(() => {
    if (!isHiddenRoute) {
      return;
    }

    sendIntent({ type: 'pauseRequested' });
  }, [isHiddenRoute, sendIntent]);

  if (isHiddenRoute) {
    return null;
  }

  const handleTogglePlay = () => {
    sendIntent(isPlaying ? { type: 'pauseRequested' } : { type: 'playRequested' });
  };

  // 走原子的"选中并播放"路径：连续派发两个 intent 会让第二次读到尚未更新的 currentTrackId，
  // 从而在用户手势里启动旧音源。
  const handleSelect = (trackId: string) => {
    playTrack(trackId);
  };

  const handleCycleRate = () => {
    sendIntent({ type: 'playbackRateRequested', rate: getNextPlaybackRate(state.playbackRate) });
  };

  // TODO: nextRequested / previousRequested / seekRequested / repeatModeRequested 由
  // @incept/music-player-core 实现并测试覆盖，没有播放器 UI 入口。首版交付播放、暂停、选曲与倍速；
  // 用户偏好类调整（例如默认倍速）归 settings 界面。登记在 BACKLOG B-16。

  // 内部错误码在 adapter 里映射成本地化文案，不把浏览器原始 Error message 直接抛给用户。
  const errorText =
    errorKind === 'playRejected' ? copy.playRejected : errorKind === 'audioError' ? copy.audioError : null;

  // 目录状态与音频错误分开呈现：两者故障来源不同，合并显示会让人分不清是列表没取到还是音频放不出来。
  // 加载中不单独提示，它已经体现在标题上。
  const catalogText = catalogStatus === 'error' ? copy.catalogError : null;
  const statusText = errorText ?? catalogText;

  const errorNotice = statusText ? (
    <div
      role="status"
      aria-live="polite"
      className="mt-2 flex max-w-[22rem] items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-nav-dropdown-bg)] px-3 py-2 text-[0.72rem] leading-5 text-[var(--color-text-muted)] shadow-[var(--shadow-nav-dropdown)]"
    >
      <span className="min-w-0 flex-1">{statusText}</span>
      {/* 只有目录错误提供重试：音频错误重试没有意义，同一份音源仍会失败。 */}
      {catalogStatus === 'error' ? (
        <button
          type="button"
          data-player-interactive
          onClick={reloadCatalog}
          className="shrink-0 cursor-pointer rounded-full px-2 py-1 text-[0.68rem] text-[var(--color-text)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-nav-item-hover)]"
        >
          {copy.catalogRetry}
        </button>
      ) : null}
    </div>
  ) : null;

  const surface =
    viewMode === 'orb' ? (
      <PlayerOrb label={copy.expand} clock={clock} onClick={() => setMode('compact')} />
    ) : viewMode === 'compact' ? (
      <PlayerCompact
        title={title}
        clock={clock}
        rateLabel={rateLabel}
        rateCycleLabel={copy.playbackRate}
        playLabel={copy.play}
        pauseLabel={copy.pause}
        collapseLabel={copy.collapse}
        expandListLabel={copy.expandList}
        collapseListLabel={copy.collapseList}
        isPlaying={isPlaying}
        fullWidth={isMobile}
        listExpanded={false}
        showOrbToggle={!isMobile}
        onTogglePlay={handleTogglePlay}
        onCollapse={() => setMode('orb')}
        onToggleList={() => setMode('expanded')}
        onCycleRate={handleCycleRate}
      />
    ) : (
      <PlayerExpanded
        copy={copy}
        heading={heading}
        items={items}
        title={title}
        clock={clock}
        rateLabel={rateLabel}
        rateCycleLabel={copy.playbackRate}
        isPlaying={isPlaying}
        fullWidth={isMobile}
        showOrbToggle={!isMobile}
        onTogglePlay={handleTogglePlay}
        onSelect={handleSelect}
        onCollapse={() => setMode('orb')}
        onCollapseList={() => setMode('compact')}
        onCycleRate={handleCycleRate}
      />
    );

  if (isMobile) {
    return (
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[var(--z-music-player)] px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
        <div className="pointer-events-auto mx-auto w-full max-w-[34rem]">
          {surface}
          {errorNotice}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={elementRef}
      style={
        geometry
          ? { left: geometry.left, top: geometry.top }
          : { left: 0, top: 0, visibility: 'hidden' }
      }
      className={`fixed z-[var(--z-music-player)] ${isDragging ? 'cursor-grabbing select-none' : 'cursor-grab'}`}
      {...dragHandlers}
    >
      {surface}
      {errorNotice}
    </div>
  );
}
