'use client';

import type { PlayerCopy } from '../adapter/player-copy';
import { PlayerCloseIcon } from './player-icons';
import { PlayerCompact, playerSurfaceWidthClass } from './player-compact';
import { PlayerPlaylist, type PlayerPlaylistItem } from './player-playlist';

type PlayerExpandedProps = {
  copy: PlayerCopy;
  heading: string;
  items: PlayerPlaylistItem[];
  title: string;
  clock: string;
  rateLabel: string;
  rateCycleLabel: string;
  isPlaying: boolean;
  fullWidth: boolean;
  showOrbToggle: boolean;
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
  rateLabel,
  rateCycleLabel,
  isPlaying,
  fullWidth,
  showOrbToggle,
  onTogglePlay,
  onSelect,
  onCollapse,
  onCollapseList,
  onCycleRate,
}: PlayerExpandedProps) {
  return (
    // 面板头部 + 列表 + 底栏同属一个表面：底栏用 bare 变体，不再嵌套第二个胶囊。
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

      <PlayerPlaylist items={items} emptyLabel={copy.emptyQueue} playLabel={copy.play} onSelect={onSelect} />

      <div className="mt-1 border-t border-[var(--color-border)]">
        <PlayerCompact
          title={title}
          clock={clock}
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
