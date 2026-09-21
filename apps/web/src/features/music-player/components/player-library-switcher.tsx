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
      className="flex gap-1.5 overflow-x-auto px-4 pb-2"
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
            className={`shrink-0 cursor-pointer whitespace-nowrap rounded-full border px-2.5 py-1 text-[0.75rem] transition-colors duration-[var(--duration-fast)] ${
              active
                ? 'border-[var(--color-nav-item-active)] bg-[var(--color-nav-item-active)] text-[var(--color-text)]'
                : 'border-[var(--color-nav-dropdown-border)] text-[var(--color-nav-dropdown-description)] hover:bg-[var(--color-nav-item-hover)] hover:text-[var(--color-text)]'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
