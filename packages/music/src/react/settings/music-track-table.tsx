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
      className="transition-colors hover:bg-[color:var(--color-surface-hover)]"
      onContextMenu={(event) => {
        event.preventDefault();
        onOpenDeleteMenu(event, track);
      }}
    >
      <td className="py-2.5 pl-2 pr-2">
        <span
          style={{ fontFamily: 'var(--font-stack-system, system-ui, sans-serif)' }}
          className="block truncate font-medium text-[length:var(--text-sm)] leading-5 text-[var(--color-text)]"
        >
          {track.title}
        </span>
        <span className="mt-0.5 block truncate font-mono text-[length:var(--text-2xs)] text-[var(--color-text-subtle)]">
          {track.trackKey}
        </span>
      </td>
      <td className="py-2.5 px-2 text-[length:var(--text-xs)] text-[var(--color-text-muted)]">
        <span
          style={{ fontFamily: 'var(--font-stack-system, system-ui, sans-serif)' }}
          className="block truncate"
        >
          {artist}
        </span>
      </td>
      <td className="py-2.5 px-2 text-[length:var(--text-xs)] text-[var(--color-text-muted)]">
        <span className="block tabular-nums">{formatTrackDuration(track.durationSeconds, copy)}</span>
      </td>
      <td className="py-2.5 px-2">
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
          buttonClassName="h-7 text-[length:var(--text-xs)]"
        />
      </td>
      <td className="py-2.5 px-1">
        <div className="flex h-7 items-center justify-center gap-0.5">
          <button
            type="button"
            aria-label={`${copy.actionMoveUp} ${track.trackKey}`}
            disabled={isBusy || isFirst}
            onClick={() => onMove(track.trackKey, -1)}
            className="inline-flex size-6.5 items-center justify-center rounded-full text-[var(--color-text-muted)] transition-all hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] disabled:cursor-default disabled:opacity-25 cursor-pointer"
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
            className="inline-flex size-6.5 items-center justify-center rounded-full text-[var(--color-text-muted)] transition-all hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] disabled:cursor-default disabled:opacity-25 cursor-pointer"
          >
            <svg viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="m4 6 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </td>
      <td className="py-2.5 px-1 text-center text-[length:var(--text-xs)]">
        <span className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap text-[length:var(--text-xs)] text-[var(--color-text-muted)]">
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
      <td className="py-2.5 pl-1 pr-2">
        <div className="flex min-h-7 items-center justify-end gap-2 whitespace-nowrap">
          {track.isActive ? (
            <button
              type="button"
              disabled={isBusy}
              title={copy.confirmDeactivateTrack}
              onClick={() => onPatch(track.trackKey, { isActive: false })}
              className="inline-flex h-7 items-center justify-center rounded-[6px] px-2.5 text-[length:var(--text-xs)] font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] active:scale-[0.98] disabled:opacity-40 cursor-pointer"
            >
              {copy.actionDeactivate}
            </button>
          ) : (
            <button
              type="button"
              disabled={isBusy || track.libraries.length === 0}
              onClick={() => onPatch(track.trackKey, { isActive: true, libraries: track.libraries })}
              className="inline-flex h-7 items-center justify-center rounded-[6px] px-2.5 text-[length:var(--text-xs)] font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] active:scale-[0.98] disabled:opacity-40 cursor-pointer"
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
    <section id="music-tracks" className="space-y-3 border-t border-[var(--color-border-faint)] pt-6">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2">
          <h4 className="text-[length:var(--text-sm)] font-medium text-[var(--color-text)]">{copy.tracksHeading}</h4>
          <span className="text-[length:var(--text-2xs)] tabular-nums text-[var(--color-text-soft)]">
            {visible.length}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[11rem] flex-1 sm:w-56">
            <input
              type="search"
              value={search}
              aria-label={copy.searchPlaceholder}
              placeholder={copy.searchPlaceholder}
              onChange={(event) => setSearch(event.target.value)}
              className="h-8 w-full rounded-[8px] border border-[var(--color-border-input,var(--color-border))] bg-[var(--color-surface-card,var(--color-bg))] pl-8 pr-2.5 text-[length:var(--text-xs)] text-[var(--color-text)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--color-text-soft)] focus:border-[var(--color-border-focus,var(--color-border-strong))] focus:outline-none [&::-webkit-search-cancel-button]:hidden"
            />
            <svg
              aria-hidden="true"
              viewBox="0 0 16 16"
              className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--color-text-soft)]"
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
            className="min-w-[8rem]"
            buttonClassName="h-8 rounded-[8px] text-[length:var(--text-xs)]"
          />
        </div>
      </div>

      <div className="overflow-x-auto [scrollbar-width:thin] [scrollbar-color:var(--color-border)_transparent] [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[var(--color-border)] [&::-webkit-scrollbar-button]:hidden">
        <table className="w-full min-w-[680px] table-fixed border-collapse text-left">
          <colgroup>
            <col className="w-[28%]" />
            <col className="w-[12%]" />
            <col className="w-[9%]" />
            <col className="w-[18%]" />
            <col className="w-[8%]" />
            <col className="w-[12%]" />
            <col className="w-[13%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-[var(--color-border-faint)] whitespace-nowrap text-[length:var(--text-2xs)] uppercase tracking-[0.06em] text-[var(--color-text-soft)]">
              <th className="py-2 pl-2 pr-2 font-medium">{copy.columnTrack}</th>
              <th className="py-2 px-2 font-medium">{copy.columnArtist}</th>
              <th className="py-2 px-2 font-medium">{copy.columnDuration}</th>
              <th className="py-2 px-2 font-medium">{copy.columnLibraries}</th>
              <th className="py-2 px-1 text-center font-medium">{copy.columnOrder}</th>
              <th className="py-2 px-1 text-center font-medium">{copy.columnStatus}</th>
              <th className="py-2 pl-1 pr-4 text-right font-medium">{copy.columnActions}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border-faint)]">
            {visible.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-[length:var(--text-xs)] text-[var(--color-text-muted)]">
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
