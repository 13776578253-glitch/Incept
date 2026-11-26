'use client';

import { formatLibraryLabel, type PlayerCopy } from '../adapter/player-copy';
import type { MusicLibraryCatalogEntry } from '../adapter/music-source';

type PlayerLibrarySwitcherProps = {
  copy: PlayerCopy;
  libraries: MusicLibraryCatalogEntry[];
  selected: string | null;
  onSelect: (key: string | null) => void;
};

// 分段 chips：库多时横向滚动，不换行、不撑破悬浮面板
// 「全部」是一个视图（key 为 null），不是曲库
export function PlayerLibrarySwitcher({
  copy,
  libraries,
  selected,
  onSelect,
}: PlayerLibrarySwitcherProps) {
  const options: Array<{ key: string | null; label: string }> = [
    { key: null, label: copy.allLibraries },
    ...libraries.map((library) => ({ key: library.key, label: formatLibraryLabel(library, copy) })),
  ];

  return (
    <div
      role="group"
      aria-label={copy.librarySwitcherLabel}
      className="no-scrollbar flex gap-1 overflow-x-auto px-3 pb-2"
    >
      {options.map((option) => {
        const active = option.key === selected;

        return (
          <button
            key={option.key ?? 'all'}
            type="button"
            data-player-interactive
            aria-pressed={active}
            onClick={() => onSelect(option.key)}
            className={`inline-flex shrink-0 cursor-pointer items-center whitespace-nowrap rounded-full px-3 py-1 text-[length:var(--text-xs)] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring-focus)] ${
              active
                ? 'bg-[var(--color-nav-item-active)] font-medium text-[var(--color-text)] ring-1 ring-[var(--color-border-faint)]'
                : 'text-[var(--color-nav-muted)] hover:bg-[var(--color-nav-item-hover)] hover:text-[var(--color-text)]'
            }`}
          >
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
