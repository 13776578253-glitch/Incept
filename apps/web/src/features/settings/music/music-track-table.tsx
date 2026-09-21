'use client';

import { useDeferredValue, useState } from 'react';

import type { MusicAdminLibrary, MusicAdminTrack } from '@/server/music/music-admin';

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
      className="border-t border-[var(--color-nav-dropdown-border)] align-top"
      onContextMenu={(event) => {
        event.preventDefault();
        onOpenDeleteMenu(event, track);
      }}
    >
      <td className="py-2 pr-3">
        <span className="flex min-h-7 items-center text-[0.8125rem] leading-5 text-[var(--color-text)]">
          {track.title}
        </span>
        <span className="mt-1 block text-[0.7rem] text-[var(--color-nav-muted)]">{track.trackKey}</span>
      </td>
      <td className="py-2 pr-3 text-[0.8125rem] text-[var(--color-nav-dropdown-description)]">
        <span className="flex h-7 items-center leading-none">{artist}</span>
      </td>
      <td className="py-2 pr-3 text-[0.8125rem] text-[var(--color-nav-dropdown-description)]">
        <span className="flex h-7 items-center leading-none">
          {formatTrackDuration(track.durationSeconds, copy)}
        </span>
      </td>
      <td className="py-2 pr-3">
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
          buttonClassName="h-7 text-[0.78rem]"
        />
      </td>
      <td className="px-1 py-2">
        <div className="flex h-7 items-center justify-center gap-1">
          <button
            type="button"
            aria-label={`${copy.actionMoveUp} ${track.trackKey}`}
            disabled={isBusy || isFirst}
            onClick={() => onMove(track.trackKey, -1)}
            className="inline-flex h-7 items-center justify-center rounded-full px-2 text-[0.75rem] leading-none text-[var(--color-nav-dropdown-description)] transition-colors hover:bg-[var(--color-nav-item-hover)] disabled:cursor-default disabled:opacity-40"
          >
            ↑
          </button>
          <button
            type="button"
            aria-label={`${copy.actionMoveDown} ${track.trackKey}`}
            disabled={isBusy || isLast}
            onClick={() => onMove(track.trackKey, 1)}
            className="inline-flex h-7 items-center justify-center rounded-full px-2 text-[0.75rem] leading-none text-[var(--color-nav-dropdown-description)] transition-colors hover:bg-[var(--color-nav-item-hover)] disabled:cursor-default disabled:opacity-40"
          >
            ↓
          </button>
        </div>
      </td>
      <td className="px-1 py-2 text-center text-[0.75rem]">
        <span
          className={
            track.isActive
              ? 'inline-flex h-7 w-full items-center justify-center leading-none text-[var(--color-nav-dropdown-description)]'
              : 'inline-flex h-7 w-full items-center justify-center leading-none text-[var(--color-nav-muted)] opacity-80'
          }
        >
          {track.isActive ? copy.statusActive : copy.statusInactive}
        </span>
      </td>
      <td className="px-1 py-2">
        <div className="flex min-h-7 flex-wrap items-center justify-center gap-2">
          {track.isActive ? (
            <button
              type="button"
              disabled={isBusy}
              title={copy.confirmDeactivateTrack}
              onClick={() => onPatch(track.trackKey, { isActive: false })}
              className="inline-flex h-7 items-center justify-center rounded-[9px] border border-[var(--color-nav-dropdown-border)] px-2.5 text-[0.75rem] leading-none text-[var(--color-nav-dropdown-description)] transition-colors hover:bg-[var(--color-nav-item-hover)] disabled:opacity-50"
            >
              {copy.actionDeactivate}
            </button>
          ) : (
            <button
              type="button"
              disabled={isBusy || track.libraries.length === 0}
              onClick={() => onPatch(track.trackKey, { isActive: true, libraries: track.libraries })}
              className="inline-flex h-7 items-center justify-center rounded-[9px] border border-[var(--color-nav-dropdown-border)] px-2.5 text-[0.75rem] leading-none text-[var(--color-text)] transition-colors hover:bg-[var(--color-nav-item-hover)] disabled:opacity-50"
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
    <section className="ml-4 max-w-[744px] space-y-3">
      <h4 className="text-[0.8125rem] font-medium text-[var(--color-text)]">{copy.tracksHeading}</h4>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          aria-label={copy.searchPlaceholder}
          placeholder={copy.searchPlaceholder}
          onChange={(event) => setSearch(event.target.value)}
          className="min-h-9 min-w-[12rem] flex-1 rounded-[9px] border border-[var(--color-nav-dropdown-border)] bg-[var(--color-bg)] px-3 text-[0.8125rem] text-[var(--color-text)] outline-none"
        />
        <MusicSelect
          value={libraryFilter}
          ariaLabel={copy.filterAllLibraries}
          onChange={setLibraryFilter}
          options={[
            { value: '', label: copy.filterAllLibraries },
            ...libraries.map((library) => ({ value: library.key, label: library.title })),
          ]}
          className="min-w-[8.25rem]"
          buttonClassName="h-9 text-[0.8125rem]"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full table-fixed border-separate border-spacing-0 text-left">
          <colgroup>
            <col className="w-[30%]" />
            <col className="w-[16%]" />
            <col className="w-[15%]" />
            <col className="w-[13%]" />
            <col className="w-[8%]" />
            <col className="w-[9%]" />
            <col className="w-[9%]" />
          </colgroup>
          <thead>
            <tr className="text-[0.7rem] uppercase tracking-[0.12em] text-[var(--color-nav-muted)]">
              <th className="pb-2 pr-3 font-medium">{copy.columnTrack}</th>
              <th className="pb-2 pr-3 font-medium">{copy.columnArtist}</th>
              <th className="pb-2 pr-3 font-medium">{copy.columnDuration}</th>
              <th className="pb-2 pr-3 font-medium">{copy.columnLibraries}</th>
              <th className="px-1 pb-2 text-center font-medium">{copy.columnOrder}</th>
              <th className="px-1 pb-2 text-center font-medium">{copy.columnStatus}</th>
              <th className="px-1 pb-2 text-center font-medium">{copy.columnActions}</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-4 text-[0.8125rem] text-[var(--color-nav-dropdown-description)]">
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
