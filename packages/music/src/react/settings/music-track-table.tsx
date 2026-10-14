'use client';

import { useDeferredValue, useState } from 'react';

import type { MusicAdminLibrary, MusicAdminTrack } from '@incept/music/application';

import { formatTrackDuration, type MusicAdminCopy } from './music-admin-copy';
import {
  MusicDeleteMenu,
  musicDeleteTargetFromEvent,
  type MusicDeleteTarget,
} from './music-delete-menu';
import { MusicSelect } from './music-select';
import { MusicMultiSelect } from './music-multi-select';

export type MusicTrackPatch = {
  publishedAt?: string | null;
  position?: number;
  isActive?: boolean;
  libraries?: string[];
};

type MusicTrackRowProps = {
  copy: MusicAdminCopy;
  track: MusicAdminTrack;
  libraries: MusicAdminLibrary[];
  isBusy: boolean;
  isFirst: boolean;
  isLast: boolean;
  onPatch: (trackKey: string, patch: MusicTrackPatch) => void;
  onMove: (trackKey: string, direction: -1 | 1) => void;
  onOpenDeleteMenu: (event: { clientX: number; clientY: number }, track: MusicAdminTrack) => void;
};

function MusicTrackRow({
  copy,
  track,
  libraries,
  isBusy,
  isFirst,
  isLast,
  onPatch,
  onMove,
  onOpenDeleteMenu,
}: MusicTrackRowProps) {
  const activeLibraries = libraries.filter((library) => library.isActive);
  // 标签没读到就显示占位符
  const artist = track.artist?.trim() ? track.artist : copy.unknownValue;

  const toggleLibrary = (key: string) => {
    const current = track.libraries;
    const next = current.includes(key)
      ? current.filter((candidate) => candidate !== key)
      : [...current, key];

    // 每首曲目至少属于一个曲库，最后一个归属不能取消
    if (next.length === 0) return;

    onPatch(track.trackKey, { libraries: next });
  };

  return (
    <tr
      className="transition-colors hover:bg-[color:var(--color-row-hover-bg)]/40"
      onContextMenu={(event) => {
        event.preventDefault();
        onOpenDeleteMenu(event, track);
      }}
    >
      <td className="py-3 pl-3 pr-2">
        <span className="block truncate font-medium text-[0.8125rem] leading-5 text-[var(--color-text)]">
          {track.title}
        </span>
        <span className="mt-0.5 block truncate font-mono text-[0.68rem] text-[var(--color-nav-muted)]">
          {track.trackKey}
        </span>
      </td>
      <td className="py-3 px-2 text-xs text-[var(--color-nav-dropdown-description)]">
        <span className="block truncate">{artist}</span>
      </td>
      <td className="py-3 px-2 text-xs text-[var(--color-nav-dropdown-description)]">
        <span className="block tabular-nums">{formatTrackDuration(track.durationSeconds, copy)}</span>
      </td>
      <td className="py-3 px-2">
        <MusicMultiSelect
          values={track.libraries}
          ariaLabel={`${copy.columnLibraries} ${track.trackKey}`}
          placeholder={copy.unknownValue}
          disabled={isBusy}
          onToggle={toggleLibrary}
          options={activeLibraries.map((library) => {
            const isLast = track.libraries.includes(library.key) && track.libraries.length === 1;

            return {
              value: library.key,
              label: library.title,
              disabled: isBusy || isLast,
              title: isLast ? copy.membershipLastHint : library.title,
            };
          })}
          buttonClassName="h-7 text-[0.75rem]"
        />
      </td>
      <td className="py-3 px-1">
        <div className="flex h-7 items-center justify-center gap-0.5">
          <button
            type="button"
            aria-label={`${copy.actionMoveUp} ${track.trackKey}`}
            disabled={isBusy || isFirst}
            onClick={() => onMove(track.trackKey, -1)}
            className="inline-flex size-6.5 items-center justify-center rounded-full text-[var(--color-nav-dropdown-description)] transition-all hover:bg-[var(--color-bg)] hover:text-[var(--color-text)] disabled:cursor-default disabled:opacity-25"
          >
            <svg viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="m4 10 4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            aria-label={`${copy.actionMoveDown} ${track.trackKey}`}
            disabled={isBusy || isLast}
            onClick={() => onMove(track.trackKey, 1)}
            className="inline-flex size-6.5 items-center justify-center rounded-full text-[var(--color-nav-dropdown-description)] transition-all hover:bg-[var(--color-bg)] hover:text-[var(--color-text)] disabled:cursor-default disabled:opacity-25"
          >
            <svg viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="m4 6 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </td>
      <td className="py-3 px-1 text-center text-[0.75rem]">
        <span
          className="inline-flex h-6 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[0.7rem] font-medium leading-none"
          style={{
            color: track.isActive ? 'var(--badge-emerald-fg)' : 'var(--badge-amber-fg)',
            backgroundColor: track.isActive ? 'var(--badge-emerald-bg)' : 'var(--badge-amber-bg)',
          }}
        >
          <span
            aria-hidden="true"
            className="size-1.5 shrink-0 rounded-full"
            style={{
              backgroundColor: track.isActive ? 'var(--badge-emerald-dot)' : 'var(--badge-amber-dot)',
            }}
          />
          <span>{track.isActive ? copy.statusActive : copy.statusInactive}</span>
        </span>
      </td>
      <td className="py-3 pl-1 pr-3.5">
        <div className="flex min-h-7 flex-wrap items-center justify-center gap-2">
          {track.isActive ? (
            <button
              type="button"
              disabled={isBusy}
              title={copy.confirmDeactivateTrack}
              onClick={() => onPatch(track.trackKey, { isActive: false })}
              className="inline-flex h-7 items-center justify-center rounded-full bg-[var(--color-bg)] px-3 text-[0.72rem] font-medium text-[var(--color-text)] shadow-[var(--shadow-card-sm)] transition-all hover:bg-[color:var(--color-row-hover-bg)] active:scale-[0.98] disabled:opacity-50"
            >
              {copy.actionDeactivate}
            </button>
          ) : (
            <button
              type="button"
              disabled={isBusy || track.libraries.length === 0}
              onClick={() => onPatch(track.trackKey, { isActive: true, libraries: track.libraries })}
              className="inline-flex h-7 items-center justify-center rounded-full bg-[var(--color-bg)] px-3 text-[0.72rem] font-medium text-[var(--color-text)] shadow-[var(--shadow-card-sm)] transition-all hover:bg-[color:var(--color-row-hover-bg)] active:scale-[0.98] disabled:opacity-50"
            >
              {copy.actionReactivate}
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

export function MusicTrackTable({
  copy,
  tracks,
  libraries,
  isBusy,
  onPatch,
  onMove,
  onDelete,
}: {
  copy: MusicAdminCopy;
  tracks: MusicAdminTrack[];
  libraries: MusicAdminLibrary[];
  isBusy: boolean;
  onPatch: (trackKey: string, patch: MusicTrackPatch) => void;
  onMove: (trackKey: string, direction: -1 | 1) => void;
  onDelete: (trackKey: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [libraryFilter, setLibraryFilter] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<MusicDeleteTarget | null>(null);
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());

  const visible = tracks.filter((track) => {
    if (libraryFilter !== '' && !track.libraries.includes(libraryFilter)) return false;

    if (deferredSearch === '') return true;

    return (
      track.title.toLowerCase().includes(deferredSearch) ||
      track.trackKey.toLowerCase().includes(deferredSearch) ||
      (track.artist ?? '').toLowerCase().includes(deferredSearch)
    );
  });

  return (
    <section className="space-y-4 rounded-2xl bg-[color:var(--color-row-bg)] p-4 sm:p-5">
      <div className="flex items-center gap-2.5">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-bg)] text-[var(--badge-emerald-icon)] shadow-[var(--shadow-card-sm)]">
          <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M6 13V4.5l7-2V11M6 13a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm7-2a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <h4 className="text-[0.9375rem] font-medium text-[var(--color-text)]">{copy.tracksHeading}</h4>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[12rem] flex-1">
          <input
            type="search"
            value={search}
            aria-label={copy.searchPlaceholder}
            placeholder={copy.searchPlaceholder}
            onChange={(event) => setSearch(event.target.value)}
            className="min-h-9.5 w-full rounded-[12px] bg-[var(--color-bg)] pl-9 pr-3.5 text-[0.8125rem] text-[var(--color-text)] outline-none shadow-[var(--shadow-card-sm)] transition-all placeholder:text-[var(--color-nav-muted)] focus:outline-none"
          />
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[var(--color-nav-muted)]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          >
            <circle cx="7" cy="7" r="4.5" />
            <path d="m10.5 10.5 3 3" strokeLinecap="round" />
          </svg>
        </div>
        <MusicSelect
          value={libraryFilter}
          ariaLabel={copy.filterAllLibraries}
          onChange={setLibraryFilter}
          options={[
            { value: '', label: copy.filterAllLibraries },
            ...libraries.map((library) => ({ value: library.key, label: library.title })),
          ]}
          className="min-w-[8.5rem]"
          buttonClassName="min-h-9.5 text-[0.8125rem] bg-[var(--color-bg)] shadow-[var(--shadow-card-sm)] border-0"
        />
      </div>

      <div className="overflow-x-auto pt-1">
        <table className="w-full table-fixed border-collapse text-left">
          <colgroup>
            <col className="w-[28%]" />
            <col className="w-[15%]" />
            <col className="w-[12%]" />
            <col className="w-[16%]" />
            <col className="w-[7%]" />
            <col className="w-[12%]" />
            <col className="w-[10%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-[var(--color-nav-dropdown-border)] text-[0.7rem] uppercase tracking-[0.08em] text-[var(--color-nav-muted)]">
              <th className="py-2.5 pl-3 pr-2 font-medium">{copy.columnTrack}</th>
              <th className="py-2.5 px-2 font-medium">{copy.columnArtist}</th>
              <th className="py-2.5 px-2 font-medium">{copy.columnDuration}</th>
              <th className="py-2.5 px-2 font-medium">{copy.columnLibraries}</th>
              <th className="py-2.5 px-1 text-center font-medium">{copy.columnOrder}</th>
              <th className="py-2.5 px-1 text-center font-medium">{copy.columnStatus}</th>
              <th className="py-2.5 pl-1 pr-3.5 text-center font-medium">{copy.columnActions}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-nav-dropdown-border)]">
            {visible.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-xs text-[var(--color-nav-dropdown-description)]">
                  {tracks.length === 0 ? copy.tableEmpty : copy.tableNoMatch}
                </td>
              </tr>
            ) : (
              visible.map((track, index) => (
                <MusicTrackRow
                  key={track.trackKey}
                  copy={copy}
                  track={track}
                  libraries={libraries}
                  isBusy={isBusy}
                  isFirst={index === 0}
                  isLast={index === visible.length - 1}
                  onPatch={onPatch}
                  onMove={onMove}
                  onOpenDeleteMenu={(event, target) =>
                    setDeleteTarget(
                      musicDeleteTargetFromEvent(event, {
                        id: target.trackKey,
                        title: target.title,
                        confirm: copy.deleteTrackConfirm,
                      }),
                    )
                  }
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <MusicDeleteMenu
        target={deleteTarget}
        copy={copy}
        isBusy={isBusy}
        onClose={() => setDeleteTarget(null)}
        onConfirm={(trackKey) => {
          setDeleteTarget(null);
          onDelete(trackKey);
        }}
      />
    </section>
  );
}
