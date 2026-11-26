'use client';

import { X } from 'lucide-react';

import type { PlayerCopy } from '../adapter/player-copy';
import type { MusicLibraryCatalogEntry } from '../adapter/music-source';
import { PlayerCompact, playerSurfaceWidthClass } from './player-compact';
import { PlayerLibrarySwitcher } from './player-library-switcher';
import { PlayerPlaylist, type PlayerPlaylistItem } from './player-playlist';

type PlayerExpandedProps = {
  copy: PlayerCopy;
  heading: string;
  items: PlayerPlaylistItem[];
  title: string;
  clock: string;
  totalClock: string;
  currentTime: number;
  duration: number;
  onSeek: (seconds: number) => void;
  rateLabel: string;
  rateCycleLabel: string;
  isPlaying: boolean;
  fullWidth: boolean;
  showOrbToggle: boolean;
  libraries: MusicLibraryCatalogEntry[];
  selectedLibrary: string | null;
  onSelectLibrary: (key: string | null) => void;
  onTogglePlay: () => void;
  onSelect: (trackId: string) => void;
  onCollapse: () => void;
  onCollapseList: () => void;
  onCycleRate: () => void;
  statusText?: string | null;
  canRetryCatalog?: boolean;
  onRetryCatalog?: () => void;
  onDismissStatus?: () => void;
  playbackRateLocked?: boolean;
};

const noticeButtonClass =
  'shrink-0 cursor-pointer rounded-full px-2 py-0.5 text-[length:var(--text-2xs)] font-medium text-[var(--color-text)] transition-colors duration-150 hover:bg-[var(--color-nav-item-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring-focus)]';

function PlayerSeekBar({
  currentTime,
  duration,
  clock,
  totalClock,
  copy,
  onSeek,
}: {
  currentTime: number;
  duration: number;
  clock: string;
  totalClock: string;
  copy: PlayerCopy;
  onSeek: (seconds: number) => void;
}) {
  const isReady = Number.isFinite(duration) && duration > 0;
  const clampedTime = isReady ? Math.max(0, Math.min(currentTime, duration)) : 0;
  const percent = isReady ? (clampedTime / duration) * 100 : 0;

  return (
    <div className="flex items-center gap-2 px-3.5 pb-0.5 pt-2.5">
      <span className="w-8 shrink-0 text-[length:var(--text-2xs)] tabular-nums text-[var(--color-text-soft)]">
        {clock}
      </span>
      <div
        data-player-interactive
        className="group relative flex h-3 min-w-0 flex-1 cursor-pointer select-none items-center"
      >
        {/* 细线轨道：常规 2px，悬停 3px */}
        <div className="relative h-[2px] w-full rounded-full bg-[var(--color-border)] transition-all duration-150 group-hover:h-[3px]">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-[var(--color-accent)] transition-[width] duration-75"
            style={{ width: `${percent}%` }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2 scale-75 opacity-0 transition-all duration-150 group-focus-within:scale-100 group-focus-within:opacity-100 group-hover:scale-100 group-hover:opacity-100"
            style={{ left: `${percent}%` }}
          >
            <span className="block size-2.5 rounded-full bg-[var(--color-accent)] ring-2 ring-[var(--color-nav-dropdown-bg)]" />
          </div>
        </div>

        {/* 透明原生 range 覆盖层：提供完整的可访问性、键盘导航与拖拽计算 */}
        <input
          type="range"
          data-player-interactive
          aria-label={copy.seek}
          aria-valuetext={`${clock} / ${totalClock}`}
          min={0}
          step={0.1}
          max={isReady ? duration : 1}
          value={clampedTime}
          disabled={!isReady}
          onChange={(event) => onSeek(Number(event.currentTarget.value))}
          onInput={(event) => onSeek(Number(event.currentTarget.value))}
          className="absolute inset-0 m-0 h-full w-full cursor-pointer p-0 opacity-0 disabled:cursor-default focus-visible:outline-none"
        />
      </div>
      <span className="w-8 shrink-0 text-right text-[length:var(--text-2xs)] tabular-nums text-[var(--color-text-soft)]">
        {totalClock}
      </span>
    </div>
  );
}

export function PlayerExpanded({
  copy,
  heading,
  items,
  title,
  clock,
  totalClock,
  currentTime,
  duration,
  onSeek,
  rateLabel,
  rateCycleLabel,
  isPlaying,
  fullWidth,
  showOrbToggle,
  libraries,
  selectedLibrary,
  onSelectLibrary,
  onTogglePlay,
  onSelect,
  onCollapse,
  onCollapseList,
  onCycleRate,
  statusText = null,
  canRetryCatalog = false,
  onRetryCatalog,
  onDismissStatus,
  playbackRateLocked = false,
}: PlayerExpandedProps) {
  return (
    // 底栏复用 compact 的 bare 变体
    <section
      aria-label={copy.expandList}
      className={`overflow-hidden rounded-[var(--radius-card,14px)] border border-[var(--color-nav-dropdown-border,var(--color-border))] bg-[var(--color-nav-dropdown-bg)] shadow-[var(--shadow-nav-dropdown)] ${
        fullWidth ? 'w-full' : playerSurfaceWidthClass
      }`}
    >
      <header className="flex items-center gap-3 px-3.5 pb-2 pt-3">
        <h3 className="min-w-0 flex-1 truncate text-[length:var(--text-xs)] font-medium text-[var(--color-text-muted)]">
          {heading}
        </h3>
        <button
          type="button"
          data-player-interactive
          onClick={onCollapseList}
          aria-label={copy.closePlaylist}
          className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-[var(--color-nav-muted)] transition-colors duration-150 hover:bg-[var(--color-nav-item-hover)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring-focus)]"
        >
          <X aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
        </button>
      </header>

      {/* 只有一个曲库时"全部"与它完全相同，切换器没有意义 */}
      {libraries.length >= 2 ? (
        <PlayerLibrarySwitcher
          copy={copy}
          libraries={libraries}
          selected={selectedLibrary}
          onSelect={onSelectLibrary}
        />
      ) : null}

      <PlayerPlaylist items={items} emptyLabel={copy.emptyQueue} playLabel={copy.play} onSelect={onSelect} />

      {statusText ? (
        <div
          role="status"
          aria-live="polite"
          className="mx-2.5 mb-2 flex items-center gap-2 rounded-[8px] border border-[var(--color-border-faint)] bg-[var(--color-surface-subtle)] px-2.5 py-1.5 text-[length:var(--text-2xs)] leading-4 text-[var(--color-text-muted)]"
        >
          <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-[var(--badge-amber-dot)]" />
          <span className="min-w-0 flex-1 truncate">{statusText}</span>
          {canRetryCatalog && onRetryCatalog ? (
            <button type="button" data-player-interactive onClick={onRetryCatalog} className={noticeButtonClass}>
              {copy.catalogRetry}
            </button>
          ) : null}
          {onDismissStatus ? (
            <button
              type="button"
              data-player-interactive
              aria-label={copy.dismissNotice}
              onClick={onDismissStatus}
              className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full text-[var(--color-nav-muted)] transition-colors duration-150 hover:bg-[var(--color-nav-item-hover)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring-focus)]"
            >
              <X aria-hidden="true" className="size-3" strokeWidth={1.75} />
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="border-t border-[var(--color-border-faint)]">
        <PlayerSeekBar
          currentTime={currentTime}
          duration={duration}
          clock={clock}
          totalClock={totalClock}
          copy={copy}
          onSeek={onSeek}
        />

        <PlayerCompact
          title={title}
          clock={clock}
          totalClock={totalClock}
          rateLabel={rateLabel}
          rateCycleLabel={rateCycleLabel}
          playLabel={copy.play}
          pauseLabel={copy.pause}
          collapseLabel={copy.collapse}
          expandListLabel={copy.expandList}
          collapseListLabel={copy.collapseList}
          isPlaying={isPlaying}
          fullWidth
          listExpanded
          showOrbToggle={showOrbToggle}
          currentTime={currentTime}
          duration={duration}
          playbackRateLocked={playbackRateLocked}
          variant="bare"
          onTogglePlay={onTogglePlay}
          onCollapse={onCollapse}
          onToggleList={onCollapseList}
          onCycleRate={onCycleRate}
        />
      </div>
    </section>
  );
}
