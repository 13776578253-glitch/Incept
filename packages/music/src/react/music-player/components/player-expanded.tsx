'use client';

import type { PlayerCopy } from '../adapter/player-copy';
import type { MusicLibraryCatalogEntry } from '../adapter/music-source';
import { PlayerCloseIcon } from './player-icons';
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
};

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
    <div
      data-player-interactive
      className="group relative flex h-3 w-full cursor-pointer items-center select-none"
    >
      {/* 极简克制细线轨道：常规 1.5px，悬停平滑微增至 2.5px */}
      <div className="relative h-[1.5px] w-full rounded-full bg-[var(--color-border)]/80 transition-all duration-150 group-hover:h-[2.5px]">
        {/* 已播放进度条 */}
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-[var(--badge-sky-icon)] transition-[width] duration-75"
          style={{ width: `${percent}%` }}
        />
        {/* 悬停微现的小巧精致小圆点指示器（更小更克制） */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 scale-75 transition-all duration-150 group-hover:opacity-100 group-hover:scale-100 group-focus-within:opacity-100 group-focus-within:scale-100"
          style={{ left: `${percent}%` }}
        >
          <span className="block size-2 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.25)] ring-1 ring-black/10 dark:ring-white/20" />
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
        style={{ outline: 'none' }}
        className="absolute inset-0 m-0 h-full w-full cursor-pointer opacity-0 p-0 disabled:cursor-default outline-none focus:outline-none focus-visible:outline-none"
      />
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
}: PlayerExpandedProps) {
  return (
    // 底栏复用 compact 的 bare 变体
    <section
      aria-label={copy.expandList}
      className={`overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-nav-dropdown-bg)] shadow-[var(--shadow-nav-dropdown)] backdrop-blur-md ${
        fullWidth ? 'w-full' : playerSurfaceWidthClass
      }`}
    >
      <header className="flex items-center gap-3 px-4 pb-2 pt-3">
        <h3 className="inline-flex min-w-0 flex-1 items-center gap-2 truncate text-[0.86rem] font-medium text-[var(--color-text)]">
          <span
            aria-hidden="true"
            className="size-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: 'var(--badge-sky-dot)' }}
          />
          <span className="truncate">{heading}</span>
        </h3>
        <button
          type="button"
          data-player-interactive
          onClick={onCollapseList}
          aria-label={copy.closePlaylist}
          style={{ outline: 'none' }}
          className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-[var(--color-nav-muted)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-nav-item-hover)] outline-none focus:outline-none focus-visible:outline-none"
        >
          <PlayerCloseIcon className="h-3.5 w-3.5" />
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

      <div className="border-t border-[var(--color-border)]">
        <div className="px-9 pt-2 pb-0.5">
          <PlayerSeekBar
            currentTime={currentTime}
            duration={duration}
            clock={clock}
            totalClock={totalClock}
            copy={copy}
            onSeek={onSeek}
          />
        </div>

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
