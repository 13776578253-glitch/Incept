'use client';

import { useDeferredValue, useState } from 'react';

import type { MusicAdminLibrary, MusicAdminTrack } from '@/server/music/music-admin';

import { formatTrackDuration, type MusicAdminCopy } from './music-admin-copy';

export type MusicTrackPatch = {
  title?: string;
  artist?: string | null;
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
}: MusicTrackRowProps) {
  const [title, setTitle] = useState(track.title);
  const [artist, setArtist] = useState(track.artist ?? '');
  const isDirty = title !== track.title || artist !== (track.artist ?? '');
  const activeLibraries = libraries.filter((library) => library.isActive);

  const toggleLibrary = (key: string) => {
    const current = track.libraries;
    const next = current.includes(key)
      ? current.filter((candidate) => candidate !== key)
      : [...current, key];

    // 每首曲目至少属于一个曲库：最后一个归属不能取消
    if (next.length === 0) return;

    onPatch(track.trackKey, { libraries: next });
  };

  return (
    <tr className="border-t border-[var(--color-nav-dropdown-border)] align-top">
      <td className="py-2 pr-3">
        <input
          type="text"
          value={title}
          disabled={isBusy}
          aria-label={`${copy.columnTrack} ${track.trackKey}`}
          onChange={(event) => setTitle(event.target.value)}
          className="min-h-9 w-full min-w-[10rem] rounded-[9px] border border-[var(--color-nav-dropdown-border)] bg-[var(--color-bg)] px-2 text-[0.8125rem] text-[var(--color-text)] outline-none disabled:opacity-60"
        />
        <span className="mt-1 block text-[0.7rem] text-[var(--color-nav-muted)]">{track.trackKey}</span>
      </td>
      <td className="py-2 pr-3">
        <input
          type="text"
          value={artist}
          disabled={isBusy}
          aria-label={`${copy.columnArtist} ${track.trackKey}`}
          onChange={(event) => setArtist(event.target.value)}
          className="min-h-9 w-full min-w-[8rem] rounded-[9px] border border-[var(--color-nav-dropdown-border)] bg-[var(--color-bg)] px-2 text-[0.8125rem] text-[var(--color-text)] outline-none disabled:opacity-60"
        />
      </td>
      <td className="py-2 pr-3 text-[0.8125rem] text-[var(--color-nav-dropdown-description)]">
        {formatTrackDuration(track.durationSeconds, copy)}
      </td>
      <td className="py-2 pr-3">
        <div className="flex flex-wrap gap-1.5">
          {activeLibraries.map((library) => {
            const active = track.libraries.includes(library.key);
            const isLast = active && track.libraries.length === 1;

            return (
              <button
                key={library.key}
                type="button"
                aria-pressed={active}
                disabled={isBusy || isLast}
                title={isLast ? copy.confirmDeactivateTrack : library.title}
                onClick={() => toggleLibrary(library.key)}
                className={`shrink-0 cursor-pointer whitespace-nowrap rounded-full border px-2.5 py-1 text-[0.72rem] transition-colors duration-[var(--duration-fast)] disabled:cursor-default ${
                  active
                    ? 'border-[var(--color-nav-item-active)] bg-[var(--color-nav-item-active)] text-[var(--color-text)]'
                    : 'border-[var(--color-nav-dropdown-border)] text-[var(--color-nav-dropdown-description)] hover:bg-[var(--color-nav-item-hover)] hover:text-[var(--color-text)]'
                }`}
              >
                {library.title}
              </button>
            );
          })}
        </div>
      </td>
      <td className="py-2 pr-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={`${copy.actionMoveUp} ${track.trackKey}`}
            disabled={isBusy || isFirst}
            onClick={() => onMove(track.trackKey, -1)}
            className="rounded-full px-2 py-1 text-[0.75rem] text-[var(--color-nav-dropdown-description)] transition-colors hover:bg-[var(--color-nav-item-hover)] disabled:cursor-default disabled:opacity-40"
          >
            ↑
          </button>
          <button
            type="button"
            aria-label={`${copy.actionMoveDown} ${track.trackKey}`}
            disabled={isBusy || isLast}
            onClick={() => onMove(track.trackKey, 1)}
            className="rounded-full px-2 py-1 text-[0.75rem] text-[var(--color-nav-dropdown-description)] transition-colors hover:bg-[var(--color-nav-item-hover)] disabled:cursor-default disabled:opacity-40"
          >
            ↓
          </button>
        </div>
      </td>
      <td className="py-2 pr-3 text-[0.75rem]">
        <span
          className={
            track.isActive
              ? 'rounded-full border border-[var(--color-nav-dropdown-border)] px-2 py-0.5 text-[var(--color-nav-dropdown-description)]'
              : 'rounded-full border border-[var(--color-nav-dropdown-border)] px-2 py-0.5 text-[var(--color-nav-muted)] opacity-80'
          }
        >
          {track.isActive ? copy.statusActive : copy.statusInactive}
        </span>
      </td>
      <td className="py-2">
        <div className="flex flex-wrap items-center gap-2">
          {isDirty ? (
            <button
              type="button"
              disabled={isBusy}
              onClick={() =>
                onPatch(track.trackKey, {
                  title: title.trim(),
                  artist: artist.trim() === '' ? null : artist.trim(),
                })
              }
              className="rounded-[9px] border border-[var(--color-nav-item-active)] bg-[var(--color-nav-item-active)] px-2.5 py-1 text-[0.75rem] text-[var(--color-text)] disabled:opacity-50"
            >
              {copy.actionSave}
            </button>
          ) : null}
          {track.isActive ? (
            <button
              type="button"
              disabled={isBusy}
              title={copy.confirmDeactivateTrack}
              onClick={() => onPatch(track.trackKey, { isActive: false })}
              className="rounded-[9px] border border-[var(--color-nav-dropdown-border)] px-2.5 py-1 text-[0.75rem] text-[var(--color-nav-dropdown-description)] transition-colors hover:bg-[var(--color-nav-item-hover)] disabled:opacity-50"
            >
              {copy.actionDeactivate}
            </button>
          ) : (
            <button
              type="button"
              disabled={isBusy || track.libraries.length === 0}
              onClick={() => onPatch(track.trackKey, { isActive: true, libraries: track.libraries })}
              className="rounded-[9px] border border-[var(--color-nav-dropdown-border)] px-2.5 py-1 text-[0.75rem] text-[var(--color-text)] transition-colors hover:bg-[var(--color-nav-item-hover)] disabled:opacity-50"
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
}: {
  copy: MusicAdminCopy;
  tracks: MusicAdminTrack[];
  libraries: MusicAdminLibrary[];
  isBusy: boolean;
  onPatch: (trackKey: string, patch: MusicTrackPatch) => void;
  onMove: (trackKey: string, direction: -1 | 1) => void;
}) {
  const [search, setSearch] = useState('');
  const [libraryFilter, setLibraryFilter] = useState('');
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
    <section className="space-y-3">
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
        <select
          value={libraryFilter}
          aria-label={copy.filterAllLibraries}
          onChange={(event) => setLibraryFilter(event.target.value)}
          className="min-h-9 rounded-[9px] border border-[var(--color-nav-dropdown-border)] bg-[var(--color-nav-dropdown-bg)] px-2 text-[0.8125rem] text-[var(--color-text)] outline-none"
        >
          <option value="">{copy.filterAllLibraries}</option>
          {libraries.map((library) => (
            <option key={library.key} value={library.key}>
              {library.title}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-0 text-left">
          <thead>
            <tr className="text-[0.7rem] uppercase tracking-[0.12em] text-[var(--color-nav-muted)]">
              <th className="pb-2 pr-3 font-medium">{copy.columnTrack}</th>
              <th className="pb-2 pr-3 font-medium">{copy.columnArtist}</th>
              <th className="pb-2 pr-3 font-medium">{copy.columnDuration}</th>
              <th className="pb-2 pr-3 font-medium">{copy.columnLibraries}</th>
              <th className="pb-2 pr-3 font-medium">{copy.columnOrder}</th>
              <th className="pb-2 pr-3 font-medium">{copy.columnStatus}</th>
              <th className="pb-2 font-medium">{copy.columnActions}</th>
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
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
