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
      className="flex flex-wrap items-center gap-2 py-2"
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
        className="h-8 min-w-[10rem] flex-1 rounded-[8px] bg-transparent px-3 text-[0.8125rem] leading-none text-[var(--color-text)] outline-none transition-colors hover:bg-[var(--color-nav-item-hover)] focus:bg-[var(--color-nav-item-hover)] disabled:opacity-60"
      />
      {isDirty ? (
        <button
          type="button"
          disabled={isBusy || title.trim() === ''}
          onClick={() => onRename(library.key, title.trim())}
          className="inline-flex h-8 items-center justify-center rounded-[9px] border border-[var(--color-nav-item-active)] bg-[var(--color-nav-item-active)] px-2.5 text-[0.75rem] leading-none text-[var(--color-text)] disabled:opacity-50"
        >
          {copy.actionSave}
        </button>
      ) : null}
      <span className="inline-flex h-8 min-w-6 items-center justify-center text-[0.75rem] leading-none tabular-nums text-[var(--color-nav-muted)]">
        {library.memberCount}
      </span>
      <span
        className="inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-[0.7rem] font-medium leading-none"
        style={{
          color: library.isActive ? 'var(--badge-emerald-fg)' : 'var(--badge-amber-fg)',
          backgroundColor: library.isActive ? 'var(--badge-emerald-bg)' : 'var(--badge-amber-bg)',
          borderColor: library.isActive ? 'var(--badge-emerald-border)' : 'var(--badge-amber-border)',
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
        className="inline-flex h-8 items-center justify-center rounded-full px-2 text-[0.75rem] leading-none text-[var(--color-nav-dropdown-description)] transition-colors hover:bg-[var(--color-nav-item-hover)] disabled:cursor-default disabled:opacity-40"
      >
        ↑
      </button>
      <button
        type="button"
        aria-label={`${copy.actionMoveDown} ${library.key}`}
        disabled={isBusy || isLast}
        onClick={() => onMove(library.key, 1)}
        className="inline-flex h-8 items-center justify-center rounded-full px-2 text-[0.75rem] leading-none text-[var(--color-nav-dropdown-description)] transition-colors hover:bg-[var(--color-nav-item-hover)] disabled:cursor-default disabled:opacity-40"
      >
        ↓
      </button>

      {library.isActive ? (
        isDeactivating ? (
          <span className="flex min-h-8 flex-wrap items-center gap-2">
            <label className="flex items-center gap-1 text-[0.72rem] text-[var(--color-nav-dropdown-description)]">
              {copy.libraryMoveMembersLabel}
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
                buttonClassName="h-8 text-[0.75rem] leading-none"
              />
            </label>
            <button
              type="button"
              disabled={isBusy || (library.memberCount > 0 && destination === '')}
              onClick={() => onSetActive(library.key, false, destination === '' ? undefined : destination)}
              className="inline-flex h-8 items-center justify-center rounded-[9px] border border-[var(--color-nav-dropdown-border)] px-2.5 text-[0.75rem] leading-none text-[var(--color-text)] disabled:opacity-50"
            >
              {copy.libraryDeactivate}
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => setIsDeactivating(false)}
              className="inline-flex h-8 items-center justify-center rounded-[9px] px-2.5 text-[0.75rem] leading-none text-[var(--color-nav-dropdown-description)] hover:bg-[var(--color-nav-item-hover)]"
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
            className="inline-flex h-8 items-center justify-center rounded-[9px] border border-[var(--color-nav-dropdown-border)] px-2.5 text-[0.75rem] leading-none text-[var(--color-nav-dropdown-description)] transition-colors hover:bg-[var(--color-nav-item-hover)] disabled:opacity-50"
          >
            {copy.libraryDeactivate}
          </button>
        )
      ) : (
        <button
          type="button"
          disabled={isBusy}
          onClick={() => onSetActive(library.key, true)}
          className="inline-flex h-8 items-center justify-center rounded-[9px] border border-[var(--color-nav-dropdown-border)] px-2.5 text-[0.75rem] leading-none text-[var(--color-text)] transition-colors hover:bg-[var(--color-nav-item-hover)] disabled:opacity-50"
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
    <section className="ml-4 max-w-[744px] space-y-3">
      <h4 className="text-[0.8125rem] font-medium text-[var(--color-text)]">{copy.librariesHeading}</h4>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={newName}
          aria-label={copy.newLibraryPlaceholder}
          placeholder={copy.newLibraryPlaceholder}
          onChange={(event) => setNewName(event.target.value)}
          className="min-h-9 min-w-[12rem] flex-1 rounded-[9px] border border-[var(--color-border)] bg-[color:var(--color-row-bg)] px-3 text-[0.8125rem] text-[var(--color-text)] outline-none transition-colors placeholder:text-[var(--color-nav-muted)] focus:border-[var(--color-nav-search-hover-border)]"
        />
        <button
          type="button"
          disabled={isBusy || newName.trim() === ''}
          onClick={() => {
            onCreate(newName.trim());
            setNewName('');
          }}
          className="rounded-[10px] bg-[var(--color-pill-active-bg)] px-3 py-1.5 text-[0.8125rem] font-medium text-[var(--color-text)] shadow-[var(--shadow-pill-active)] transition-colors hover:bg-[color:var(--color-row-hover-bg)] disabled:opacity-50"
        >
          {copy.newLibraryAction}
        </button>
      </div>

      <ul className="divide-y divide-[var(--color-nav-dropdown-border)]">
        {libraries.length === 0 ? (
          <li className="text-[0.8125rem] text-[var(--color-nav-dropdown-description)]">
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
