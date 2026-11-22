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
      className="flex flex-wrap items-center gap-2.5 py-2.5 transition-colors hover:bg-[color:var(--color-surface-subtle)] rounded-[8px] px-2 -mx-2"
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
        className="h-7 min-w-[7rem] flex-1 rounded-[6px] border border-transparent bg-transparent -ml-1.5 px-1.5 text-[length:var(--text-sm)] font-medium text-[var(--color-text)] outline-none transition-colors hover:bg-[var(--color-surface-hover)] focus:border-[var(--color-border-focus)] focus:bg-[var(--color-surface-card,var(--color-bg))] focus:outline-none disabled:opacity-60"
      />
      {isDirty ? (
        <button
          type="button"
          disabled={isBusy || title.trim() === ''}
          onClick={() => onRename(library.key, title.trim())}
          className="inline-flex h-7 items-center justify-center rounded-[6px] border border-[var(--color-border-subtle)] bg-[var(--color-surface-card,var(--color-bg))] px-2.5 text-[length:var(--text-xs)] font-medium text-[var(--color-text)] transition-colors hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-hover)] active:scale-[0.98] disabled:opacity-50 cursor-pointer"
        >
          {copy.actionSave}
        </button>
      ) : null}
      <span className="inline-flex h-6 min-w-6 items-center justify-center px-1 text-[length:var(--text-xs)] tabular-nums text-[var(--color-text-soft)]">
        {library.memberCount}
      </span>
      <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap px-1 text-[length:var(--text-xs)] text-[var(--color-text-muted)]">
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
        className="inline-flex size-6.5 items-center justify-center rounded-[6px] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] disabled:cursor-default disabled:opacity-25 cursor-pointer"
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
        className="inline-flex size-6.5 items-center justify-center rounded-[6px] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] disabled:cursor-default disabled:opacity-25 cursor-pointer"
      >
        <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.75">
          <path d="m4 6 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {library.isActive ? (
        isDeactivating ? (
          <span className="flex min-h-7 flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-[length:var(--text-xs)] text-[var(--color-text-muted)]">
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
                buttonClassName="h-7 rounded-[6px] text-[length:var(--text-xs)]"
              />
            </label>
            <button
              type="button"
              disabled={isBusy || (library.memberCount > 0 && destination === '')}
              onClick={() => onSetActive(library.key, false, destination === '' ? undefined : destination)}
              className="inline-flex h-7 items-center justify-center rounded-[6px] border border-[var(--badge-amber-border)] bg-[var(--badge-amber-bg)] px-2.5 text-[length:var(--text-xs)] font-medium text-[var(--badge-amber-fg)] transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-50 cursor-pointer"
            >
              {copy.libraryDeactivate}
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => setIsDeactivating(false)}
              className="inline-flex h-7 items-center justify-center rounded-[6px] px-2.5 text-[length:var(--text-xs)] font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] cursor-pointer"
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
            className="inline-flex h-7 items-center justify-center rounded-[6px] px-2.5 text-[length:var(--text-xs)] font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] active:scale-[0.98] disabled:opacity-40 cursor-pointer"
          >
            {copy.libraryDeactivate}
          </button>
        )
      ) : (
        <button
          type="button"
          disabled={isBusy}
          onClick={() => onSetActive(library.key, true)}
          className="inline-flex h-7 items-center justify-center rounded-[6px] px-2.5 text-[length:var(--text-xs)] font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] active:scale-[0.98] disabled:opacity-40 cursor-pointer"
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
    <section id="music-libraries" className="space-y-3 border-t border-[var(--color-border-faint)] pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h4 className="text-[length:var(--text-sm)] font-medium text-[var(--color-text)]">{copy.librariesHeading}</h4>
          <span className="text-[length:var(--text-2xs)] tabular-nums text-[var(--color-text-soft)]">
            {libraries.length}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newName}
            aria-label={copy.newLibraryPlaceholder}
            placeholder={copy.newLibraryPlaceholder}
            onChange={(event) => setNewName(event.target.value)}
            className="h-8 w-44 sm:w-56 rounded-[8px] border border-[var(--color-border-input,var(--color-border))] bg-[var(--color-surface-card,var(--color-bg))] px-2.5 text-[length:var(--text-xs)] text-[var(--color-text)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--color-text-soft)] focus:border-[var(--color-border-focus,var(--color-border-strong))] focus:outline-none"
          />
          <button
            type="button"
            disabled={isBusy || newName.trim() === ''}
            onClick={() => {
              onCreate(newName.trim());
              setNewName('');
            }}
            className="inline-flex h-8 shrink-0 items-center justify-center rounded-[8px] border border-[var(--color-border-subtle,var(--color-border))] bg-[var(--color-surface-card,var(--color-bg))] px-3 text-[length:var(--text-xs)] font-medium text-[var(--color-text)] transition-colors hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-hover)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
          >
            {copy.newLibraryAction}
          </button>
        </div>
      </div>

      <ul className="divide-y divide-[var(--color-border-faint)] border-t border-[var(--color-border-faint)]">
        {libraries.length === 0 ? (
          <li className="p-4 text-center text-[length:var(--text-xs)] text-[var(--color-text-muted)]">
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
