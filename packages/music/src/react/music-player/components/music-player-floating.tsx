'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useMemo } from 'react';

import {
  formatClock,
  formatPlaybackRate,
  formatTrackDate,
  getNextPlaybackRate,
  getPlayerCopy,
} from '../adapter/player-copy';

import { findCatalogPublishedAt, resolveLibrarySelection } from '../adapter/music-source';

import { useMusicPlayerPreferences } from '../../preferences/use-music-player-preferences';
import { useFloatingPosition } from '../hooks/use-floating-position';
import { useMusicPlayer } from '../hooks/use-music-player';
import { usePlayerViewport } from '../hooks/use-player-viewport';

import { PlayerCompact } from './player-compact';
import { PlayerExpanded } from './player-expanded';
import { PlayerOrb } from './player-orb';
import type { PlayerPlaylistItem } from './player-playlist';

export function MusicPlayerFloating({
  locale,
  isHiddenRoute: matchesHiddenRoute,
}: {
  locale: string;
  isHiddenRoute: (pathname: string) => boolean;
}) {
  const pathname = usePathname();
  const copy = useMemo(() => getPlayerCopy(locale), [locale]);
  const { state, sendIntent, playTrack, reloadCatalog, currentTrack, errorKind, catalog, libraries, catalogStatus } =
    useMusicPlayer();
  const { mode: viewport, isReady: isViewportReady } = usePlayerViewport();
  const {
    playbackRateLocked,
    rememberPlacement,
    playbackMode,
    selectedLibrary,
    setSelectedLibrary,
    isReady: isMusicPreferencesReady,
  } = useMusicPlayerPreferences();

  const isMobile = viewport === 'mobile';
  const isHiddenRoute = matchesHiddenRoute(pathname);

  const { elementRef, placement, geometry, isDragging, setMode, dragHandlers } = useFloatingPosition({
    draggable: !isMobile,
    isReadyToPosition: isViewportReady,
    rememberPlacement,
    isPreferenceReady: isMusicPreferencesReady,
  });

  // 播放模式是持久化偏好，core 的重播模式是会话内的；偏好变化时套用给 core
  useEffect(() => {
    sendIntent({ type: 'repeatModeRequested', mode: playbackMode });
  }, [playbackMode, sendIntent]);

  const viewMode = isMobile && placement.mode === 'orb' ? 'compact' : placement.mode;
  const isPlaying = state.status === 'playing';

  const title =
    currentTrack?.title ?? (catalogStatus === 'loading' ? copy.catalogLoading : copy.emptyQueue);
  // clock ：当前位置 / totalClock ：总时长
  const totalClock = formatClock(state.duration > 0 ? state.duration : currentTrack?.durationHint ?? 0);
  const clock = formatClock(state.currentTime);
  const rateLabel = formatPlaybackRate(state.playbackRate);
  const heading = copy.formatPlaylistHeading(state.queue.length);
  // 存储的库已被删除或改名时先按"全部"显示；runtime mount 会在目录就绪后把偏好写回 null
  const selectedLibraryKey = resolveLibrarySelection(libraries, selectedLibrary);

  const items = useMemo<PlayerPlaylistItem[]>(
    () =>
      state.queue.map((track) => {
        const publishedAt = findCatalogPublishedAt(catalog, track.id);

        return {
          id: track.id,
          title: track.title,
          // 时长未知留空
          meta: publishedAt
            ? formatTrackDate(locale, publishedAt)
            : track.durationHint
              ? formatClock(track.durationHint)
              : '',
          isCurrent: track.id === state.currentTrackId,
        };
      }),
    [catalog, locale, state.queue, state.currentTrackId],
  );

  // 隐藏路由（见 player-route-policy）：只隐藏 UI，不中断播放
  if (isHiddenRoute) {
    return null;
  }

  const handleTogglePlay = () => {
    sendIntent(isPlaying ? { type: 'pauseRequested' } : { type: 'playRequested' });
  };

  // 走原子的"选中并播放"路径：连续派发两个 intent 会让第二次读到尚未更新的 currentTrackId，从而在用户手势里启动旧音源
  const handleSelect = (trackId: string) => {
    playTrack(trackId);
  };

  const handleCycleRate = () => {
    // 锁定态下按钮保留但点击不改变档位
    if (playbackRateLocked) {
      return;
    }

    sendIntent({ type: 'playbackRateRequested', rate: getNextPlaybackRate(state.playbackRate) });
  };

  /* TODO: nextRequested / previousRequested 已在 core 实现并有测试覆盖，播放器 UI 依然没有入口；
     seekRequested 已接入展开列表原生进度滑杆；repeatModeRequested 由设置里的「默认播放模式」驱动。登记在 BACKLOG B-16。 */

  // 错误码在 adapter 里映射成本地化文案，不外抛浏览器的原始 message
  const errorText =
    errorKind === 'playRejected' ? copy.playRejected : errorKind === 'audioError' ? copy.audioError : null;

  // 目录状态与音频错误分开呈现：两者故障来源不同，合并显示会让人分不清是列表没取到还是音频放不出来。
  // 加载中不单独提示
  const catalogText = catalogStatus === 'error' ? copy.catalogError : null;
  const statusText = errorText ?? catalogText;

  const errorNotice = statusText ? (
    <div
      role="status"
      aria-live="polite"
      className="mt-2 flex max-w-[22rem] items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-nav-dropdown-bg)] px-3 py-2 text-[0.72rem] leading-5 text-[var(--color-text-muted)] shadow-[var(--shadow-nav-dropdown)]"
    >
      <span className="min-w-0 flex-1">{statusText}</span>
      {/* 只有目录错误提供重试：音频错误重试没有意义，同一份音源仍会失败 */}
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
      <PlayerOrb
        label={copy.expand}
        clock={clock}
        totalClock={totalClock}
        onClick={() => setMode('compact')}
        isPlaying={isPlaying}
        currentTime={state.currentTime}
        duration={state.duration}
      />
    ) : viewMode === 'compact' ? (
      <PlayerCompact
        title={title}
        clock={clock} totalClock={totalClock}
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
        currentTime={state.currentTime}
        duration={state.duration}
        onSeek={seconds => sendIntent({ type: 'seekRequested', seconds })}
        heading={heading}
        items={items}
        title={title}
        clock={clock} totalClock={totalClock}
        rateLabel={rateLabel}
        rateCycleLabel={copy.playbackRate}
        isPlaying={isPlaying}
        fullWidth={isMobile}
        showOrbToggle={!isMobile}
        libraries={libraries}
        selectedLibrary={selectedLibraryKey}
        onSelectLibrary={setSelectedLibrary}
        onTogglePlay={handleTogglePlay}
        onSelect={handleSelect}
        onCollapse={() => setMode('orb')}
        onCollapseList={() => setMode('compact')}
        onCycleRate={handleCycleRate}
      />
    );

  if (isMobile) {
    return (
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[var(--z-feature-floating)] px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
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
      className={`fixed z-[var(--z-feature-floating)] ${isDragging ? 'cursor-grabbing select-none' : 'cursor-grab'}`}
      {...dragHandlers}
    >
      {surface}
      {errorNotice}
    </div>
  );
}
