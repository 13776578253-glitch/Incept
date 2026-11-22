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
    return (
      <p className="px-4 py-6 text-center text-[length:var(--text-xs)] text-[var(--color-text-soft)]">
        {emptyLabel}
      </p>
    );
  }

  // 行高固定 h-10（40px）+ 2px 间距，列表最多露出约 5 行，超出滚动
  return (
    <ul className="max-h-[13.5rem] space-y-0.5 overflow-y-auto overscroll-contain px-1.5 pb-1.5 [scrollbar-color:var(--color-border)_transparent] [scrollbar-width:thin]">
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            data-player-interactive
            onClick={() => onSelect(item.id)}
            aria-label={`${playLabel}: ${item.title}`}
            aria-current={item.isCurrent ? 'true' : undefined}
            className={`group flex h-10 w-full cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring-focus)] ${
              item.isCurrent
                ? 'bg-[var(--color-nav-item-active)] ring-1 ring-[var(--color-border-faint)]'
                : 'hover:bg-[var(--color-nav-item-hover)]'
            }`}
          >
            <span
              aria-hidden
              className={`flex size-5 shrink-0 items-center justify-center rounded-full transition-colors ${
                item.isCurrent
                  ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                  : 'bg-[var(--color-surface-subtle)] text-[var(--color-nav-muted)] group-hover:text-[var(--color-text)]'
              }`}
            >
              <PlayerPlayIcon className="size-2.5" />
            </span>

            <span className="flex min-w-0 flex-1 items-center gap-1.5">
              <span
                style={{ fontFamily: 'var(--font-stack-system, system-ui, sans-serif)' }}
                className={`min-w-0 truncate text-[length:var(--text-sm)] ${
                  item.isCurrent ? 'font-medium text-[var(--color-text)]' : 'text-[var(--color-text-muted)]'
                }`}
              >
                {item.title}
              </span>
              {item.isCurrent ? (
                <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-[var(--color-accent)]" />
              ) : null}
            </span>

            <span className="shrink-0 text-[length:var(--text-2xs)] tabular-nums text-[var(--color-text-soft)]">
              {item.meta}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
