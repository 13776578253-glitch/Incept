'use client';

import { PlayerPlayIcon } from './player-icons';

export type PlayerPlaylistItem = {
  id: string;
  title: string;
  meta: string;
  isCurrent: boolean;
};

type PlayerPlaylistProps = {
  items: PlayerPlaylistItem[];
  emptyLabel: string;
  playLabel: string;
  onSelect: (trackId: string) => void;
};

export function PlayerPlaylist({ items, emptyLabel, playLabel, onSelect }: PlayerPlaylistProps) {
  if (items.length === 0) {
    return <p className="px-4 py-6 text-center text-[0.78rem] text-[var(--color-text-soft)]">{emptyLabel}</p>;
  }

  // 行高固定 h-11（44px），列表最多露出 5 行（5 × 44 = 13.75rem），超出滚动。
  // 固定行高是"最多 5 首"这个约束能成立的前提：行高随内容变化就数不准可见条数。
  return (
    <ul className="max-h-[13.75rem] overflow-y-auto overscroll-contain [scrollbar-color:var(--color-border)_transparent] [scrollbar-width:thin]">
      {items.map((item) => (
        <li key={item.id} className="border-t border-[var(--color-border)] first:border-t-0">
          <button
            type="button"
            data-player-interactive
            onClick={() => onSelect(item.id)}
            aria-label={`${playLabel}: ${item.title}`}
            aria-current={item.isCurrent ? 'true' : undefined}
            className="flex h-11 w-full cursor-pointer items-center gap-3 px-4 text-left transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-nav-item-hover)]"
          >
            <span
              aria-hidden
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                item.isCurrent ? 'bg-[var(--color-nav-item-active)]' : ''
              } text-[var(--color-nav-muted)]`}
            >
              <PlayerPlayIcon className="h-2.5 w-2.5" />
            </span>

            <span
              className={`min-w-0 flex-1 truncate text-[0.82rem] ${
                item.isCurrent ? 'font-medium text-[var(--color-text)]' : 'text-[var(--color-text-muted)]'
              }`}
            >
              {item.title}
            </span>

            <span className="shrink-0 text-[0.7rem] tabular-nums text-[var(--color-text-soft)]">{item.meta}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
