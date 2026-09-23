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

export function PlayerExpanded({
  copy,
  heading,
  items,
  title,
  clock,
  totalClock,
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
      className={`overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-nav-dropdown-bg)] shadow-[var(--shadow-nav-dropdown)] ${
        fullWidth ? 'w-full' : playerSurfaceWidthClass
      }`}
    >
      <header className="flex items-center gap-3 px-4 pb-2 pt-3">
        <h3 className="min-w-0 flex-1 truncate text-[0.86rem] font-medium text-[var(--color-text)]">{heading}</h3>
        <button
          type="button"
          data-player-interactive
          onClick={onCollapseList}
          aria-label={copy.closePlaylist}
          className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-[var(--color-nav-muted)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-nav-item-hover)]"
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

      <div className="mt-1 border-t border-[var(--color-border)]">
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
