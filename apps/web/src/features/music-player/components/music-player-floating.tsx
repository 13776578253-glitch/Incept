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
import { getTrackPublishedAt } from '../adapter/mock-music-source';
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
  const { state, sendIntent, currentTrack, errorKind } = useMusicPlayer();
  const { mode: viewport, isReady: isViewportReady } = usePlayerViewport();

  const isMobile = viewport === 'mobile';
  const isHiddenRoute = isMusicPlayerHiddenRoute(pathname);

  const { elementRef, placement, geometry, isDragging, setMode, dragHandlers } = useFloatingPosition({
    draggable: !isMobile,
    isReadyToPosition: isViewportReady,
  });

  // 移动端固定底部，没有独立气泡态。
  const viewMode = isMobile && placement.mode === 'orb' ? 'compact' : placement.mode;
  const isPlaying = state.status === 'playing';

  const title = currentTrack?.title ?? copy.emptyQueue;
  const clock = formatClock(state.duration > 0 ? state.duration : currentTrack?.durationHint ?? 0);
  const rateLabel = formatPlaybackRate(state.playbackRate);
  const heading = copy.formatPlaylistHeading(state.queue.length);

  const items = useMemo<PlayerPlaylistItem[]>(
    () =>
      state.queue.map((track) => {
        const publishedAt = getTrackPublishedAt(track.id);

        return {
          id: track.id,
          title: track.title,
          meta: publishedAt ? formatTrackDate(locale, publishedAt) : formatClock(track.durationHint ?? 0),
          isCurrent: track.id === state.currentTrackId,
        };
      }),
    [locale, state.queue, state.currentTrackId],
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

  const handleSelect = (trackId: string) => {
    sendIntent({ type: 'selectTrackRequested', trackId });
    sendIntent({ type: 'playRequested' });
  };

  // 倍速：点一次进一档。档位定义在 adapter，且全部落在 core 的合法区间内。
  const handleCycleRate = () => {
    sendIntent({ type: 'playbackRateRequested', rate: getNextPlaybackRate(state.playbackRate) });
  };

  // TODO: nextRequested / previousRequested / seekRequested / repeatModeRequested
  // 已在 @incept/music-player-core 实现并有测试覆盖，但本期刻意不接入播放器 UI。
  // 用户偏好类调整（例如默认倍速）计划移到 settings 界面，之后单独讨论。
  // 不要把这四项误当成已交付能力。

  // 内部错误码在 adapter 里映射成本地化文案，不把浏览器原始 Error message 直接抛给用户。
  const errorText =
    errorKind === 'playRejected' ? copy.playRejected : errorKind === 'audioError' ? copy.audioError : null;

  const errorNotice = errorText ? (
    <p
      role="status"
      aria-live="polite"
      className="mt-2 max-w-[22rem] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-nav-dropdown-bg)] px-3 py-2 text-[0.72rem] leading-5 text-[var(--color-text-muted)] shadow-[var(--shadow-nav-dropdown)]"
    >
      {errorText}
    </p>
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
