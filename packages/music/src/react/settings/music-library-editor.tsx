'use client';

import { useState } from 'react';

import type { MusicAdminLibrary } from '@incept/music/application';

import type { MusicAdminCopy } from './music-admin-copy';
import {
  MusicDeleteMenu,
  musicDeleteTargetFromEvent,
  type MusicDeleteTarget,
} from './music-delete-menu';
import { MusicSelect } from './music-select';

type MusicLibraryEditorProps = {
  copy: MusicAdminCopy;
  libraries: MusicAdminLibrary[];
  isBusy: boolean;
  onCreate: (name: string) => void;
  onRename: (key: string, title: string) => void;
  onMove: (key: string, direction: -1 | 1) => void;
  onSetActive: (key: string, isActive: boolean, moveMembersTo?: string) => void;
  onDelete: (key: string) => void;
};

function LibraryRow({
  copy,
  library,
  libraries,
  isBusy,
  isFirst,
  isLast,
  onRename,
  onMove,
  onSetActive,
  onOpenDeleteMenu,
}: {
  copy: MusicAdminCopy;
  library: MusicAdminLibrary;
  libraries: MusicAdminLibrary[];
  isBusy: boolean;
  isFirst: boolean;
  isLast: boolean;
  onOpenDeleteMenu: (event: { clientX: number; clientY: number }, library: MusicAdminLibrary) => void;
} & Pick<MusicLibraryEditorProps, 'onRename' | 'onMove' | 'onSetActive'>) {
  const [title, setTitle] = useState(library.title);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [destination, setDestination] = useState('');
  const isDirty = title !== library.title;
  const destinations = libraries.filter(
    (candidate) => candidate.isActive && candidate.key !== library.key,
  );

  return (
    <li
      className="flex flex-wrap items-center gap-2.5 py-3 transition-colors hover:bg-[color:var(--color-row-hover-bg)]/30 rounded-xl px-2.5 -mx-2.5"
      onContextMenu={(event) => {
        event.preventDefault();
        onOpenDeleteMenu(event, library);
      }}
    >
      <input
        type="text"
        value={title}
        disabled={isBusy}
        aria-label={`${copy.librariesHeading} ${library.key}`}
        onChange={(event) => setTitle(event.target.value)}
        className="h-8 min-w-[8rem] flex-1 rounded-[10px] bg-[var(--color-bg)] px-3 text-[0.8125rem] font-medium text-[var(--color-text)] outline-none shadow-[var(--shadow-card-sm)] transition-all focus:outline-none disabled:opacity-60"
      />
      {isDirty ? (
        <button
          type="button"
          disabled={isBusy || title.trim() === ''}
          onClick={() => onRename(library.key, title.trim())}
          className="inline-flex h-7 items-center justify-center rounded-full bg-[var(--color-bg)] px-3 text-[0.75rem] font-medium text-[var(--color-text)] shadow-[var(--shadow-card-sm)] transition-all hover:bg-[color:var(--color-row-hover-bg)] active:scale-[0.98] disabled:opacity-50"
        >
          {copy.actionSave}
        </button>
      ) : null}
      <span className="inline-flex h-6 min-w-6 items-center justify-center px-1 text-[0.75rem] font-medium tabular-nums text-[var(--color-nav-muted)]">
        {library.memberCount}
      </span>
      <span
        className="inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[0.7rem] font-medium leading-none"
        style={{
          color: library.isActive ? 'var(--badge-emerald-fg)' : 'var(--badge-amber-fg)',
          backgroundColor: library.isActive ? 'var(--badge-emerald-bg)' : 'var(--badge-amber-bg)',
        }}
      >
        <span
          aria-hidden="true"
          className="size-1.5 shrink-0 rounded-full"
          style={{
            backgroundColor: library.isActive ? 'var(--badge-emerald-dot)' : 'var(--badge-amber-dot)',
          }}
        />
        <span>{library.isActive ? copy.libraryActive : copy.libraryInactive}</span>
      </span>
      <button
        type="button"
        aria-label={`${copy.actionMoveUp} ${library.key}`}
        disabled={isBusy || isFirst}
        onClick={() => onMove(library.key, -1)}
        className="inline-flex size-7 items-center justify-center rounded-full text-[var(--color-nav-dropdown-description)] transition-all hover:bg-[var(--color-bg)] hover:text-[var(--color-text)] disabled:cursor-default disabled:opacity-25"
      >
        <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.75">
          <path d="m4 10 4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button
        type="button"
        aria-label={`${copy.actionMoveDown} ${library.key}`}
        disabled={isBusy || isLast}
        onClick={() => onMove(library.key, 1)}
        className="inline-flex size-7 items-center justify-center rounded-full text-[var(--color-nav-dropdown-description)] transition-all hover:bg-[var(--color-bg)] hover:text-[var(--color-text)] disabled:cursor-default disabled:opacity-25"
      >
        <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.75">
          <path d="m4 6 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {library.isActive ? (
        isDeactivating ? (
          <span className="flex min-h-7 flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-[var(--color-nav-dropdown-description)]">
              <span>{copy.libraryMoveMembersLabel}</span>
              <MusicSelect
                value={destination}
                disabled={isBusy}
                ariaLabel={`${copy.libraryMoveMembersLabel} ${library.key}`}
                onChange={setDestination}
                options={[
                  { value: '', label: '—' },
                  ...destinations.map((candidate) => ({
                    value: candidate.key,
                    label: candidate.title,
                  })),
                ]}
                className="min-w-20"
                buttonClassName="h-7 text-[0.75rem]"
              />
            </label>
            <button
              type="button"
              disabled={isBusy || (library.memberCount > 0 && destination === '')}
              onClick={() => onSetActive(library.key, false, destination === '' ? undefined : destination)}
              className="inline-flex h-7 items-center justify-center rounded-full bg-[var(--badge-amber-bg)] px-3 text-[0.75rem] font-medium text-[var(--badge-amber-fg)] shadow-[var(--shadow-card-sm)] transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-50"
            >
              {copy.libraryDeactivate}
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => setIsDeactivating(false)}
              className="inline-flex h-7 items-center justify-center rounded-full bg-[var(--color-bg)] px-3 text-[0.75rem] font-medium text-[var(--color-nav-dropdown-description)] shadow-[var(--shadow-card-sm)] transition-all hover:bg-[color:var(--color-row-hover-bg)] hover:text-[var(--color-text)]"
            >
              {copy.actionCancel}
            </button>
          </span>
        ) : (
          <button
            type="button"
            disabled={isBusy || destinations.length === 0}
            title={destinations.length === 0 ? copy.libraryRemoveHint : copy.confirmDeactivateLibrary}
            onClick={() => {
              if (library.memberCount === 0) {
                onSetActive(library.key, false);
                return;
              }

              setIsDeactivating(true);
            }}
            className="inline-flex h-7.5 items-center justify-center rounded-full bg-[var(--color-bg)] px-3.5 text-[0.75rem] font-medium text-[var(--color-text)] shadow-[var(--shadow-card-sm)] transition-all hover:bg-[color:var(--color-row-hover-bg)] active:scale-[0.98] disabled:opacity-50"
          >
            {copy.libraryDeactivate}
          </button>
        )
      ) : (
        <button
          type="button"
          disabled={isBusy}
          onClick={() => onSetActive(library.key, true)}
          className="inline-flex h-7.5 items-center justify-center rounded-full bg-[var(--color-bg)] px-3.5 text-[0.75rem] font-medium text-[var(--color-text)] shadow-[var(--shadow-card-sm)] transition-all hover:bg-[color:var(--color-row-hover-bg)] active:scale-[0.98] disabled:opacity-50"
        >
          {copy.libraryReactivate}
        </button>
      )}
    </li>
  );
}

export function MusicLibraryEditor({
  copy,
  libraries,
  isBusy,
  onCreate,
  onRename,
  onMove,
  onSetActive,
  onDelete,
}: MusicLibraryEditorProps) {
  const [newName, setNewName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<MusicDeleteTarget | null>(null);

  return (
    <section className="space-y-4 rounded-2xl bg-[color:var(--color-row-bg)] p-4 sm:p-5">
      <div className="flex items-center gap-2.5">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-bg)] text-[var(--badge-indigo-icon)] shadow-[var(--shadow-card-sm)]">
          <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h3.086a1.5 1.5 0 0 1 1.06.44l1.315 1.314a1.5 1.5 0 0 0 1.06.446H12.5A1.5 1.5 0 0 1 14 6.7v5.8a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12.5v-8Z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <h4 className="text-[0.9375rem] font-medium text-[var(--color-text)]">{copy.librariesHeading}</h4>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <input
          type="text"
          value={newName}
          aria-label={copy.newLibraryPlaceholder}
          placeholder={copy.newLibraryPlaceholder}
          onChange={(event) => setNewName(event.target.value)}
          className="min-h-9.5 min-w-[12rem] flex-1 rounded-[12px] bg-[var(--color-bg)] px-3.5 text-[0.8125rem] text-[var(--color-text)] outline-none shadow-[var(--shadow-card-sm)] transition-all placeholder:text-[var(--color-nav-muted)] focus:outline-none"
        />
        <button
          type="button"
          disabled={isBusy || newName.trim() === ''}
          onClick={() => {
            onCreate(newName.trim());
            setNewName('');
          }}
          className="inline-flex min-h-9.5 items-center justify-center gap-1.5 rounded-full bg-[var(--color-bg)] px-4 text-[0.8125rem] font-medium text-[var(--color-text)] shadow-[var(--shadow-card-sm)] transition-all hover:bg-[color:var(--color-row-hover-bg)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {copy.newLibraryAction}
        </button>
      </div>

      <ul className="divide-y divide-[var(--color-nav-dropdown-border)] pt-1">
        {libraries.length === 0 ? (
          <li className="p-4 text-center text-xs text-[var(--color-nav-dropdown-description)]">
            {copy.libraryEmpty}
          </li>
        ) : (
          libraries.map((library, index) => (
            <LibraryRow
              key={library.key}
              copy={copy}
              library={library}
              libraries={libraries}
              isBusy={isBusy}
              isFirst={index === 0}
              isLast={index === libraries.length - 1}
              onRename={onRename}
              onMove={onMove}
              onSetActive={onSetActive}
              onOpenDeleteMenu={(event, target) =>
                setDeleteTarget(
                  musicDeleteTargetFromEvent(event, {
                    id: target.key,
                    title: target.title,
                    confirm: copy.deleteLibraryConfirm,
                  }),
                )
              }
            />
          ))
        )}
      </ul>

      <MusicDeleteMenu
        target={deleteTarget}
        copy={copy}
        isBusy={isBusy}
        onClose={() => setDeleteTarget(null)}
        onConfirm={(key) => {
          setDeleteTarget(null);
          onDelete(key);
        }}
      />
    </section>
  );
}
