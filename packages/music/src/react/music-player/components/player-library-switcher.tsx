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
            style={{ outline: 'none' }}
            className={`inline-flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-[0.75rem] transition-all duration-[var(--duration-fast)] outline-none focus:outline-none focus-visible:outline-none ${
              active
                ? 'bg-[var(--color-pill-active-bg)] font-medium text-[var(--color-text)] shadow-[var(--shadow-pill-active)]'
                : 'text-[var(--color-nav-dropdown-description)] hover:bg-[var(--color-nav-item-hover)] hover:text-[var(--color-text)]'
            }`}
          >
            {active ? (
              <span
                aria-hidden="true"
                className="size-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: 'var(--badge-sky-dot)' }}
              />
            ) : null}
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
