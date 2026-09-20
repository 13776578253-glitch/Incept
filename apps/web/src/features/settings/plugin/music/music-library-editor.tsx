'use client';

import { useState } from 'react';

import type { MusicAdminLibrary } from '@/server/music/music-admin';

import type { MusicAdminCopy } from './music-admin-copy';

type MusicLibraryEditorProps = {
  copy: MusicAdminCopy;
  libraries: MusicAdminLibrary[];
  isBusy: boolean;
  onCreate: (name: string) => void;
  onRename: (key: string, title: string) => void;
  onMove: (key: string, direction: -1 | 1) => void;
  onSetActive: (key: string, isActive: boolean, moveMembersTo?: string) => void;
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
}: {
  copy: MusicAdminCopy;
  library: MusicAdminLibrary;
  libraries: MusicAdminLibrary[];
  isBusy: boolean;
  isFirst: boolean;
  isLast: boolean;
} & Pick<MusicLibraryEditorProps, 'onRename' | 'onMove' | 'onSetActive'>) {
  const [title, setTitle] = useState(library.title);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [destination, setDestination] = useState('');
  const isDirty = title !== library.title;
  const destinations = libraries.filter(
    (candidate) => candidate.isActive && candidate.key !== library.key,
  );

  return (
    <li className="flex flex-wrap items-center gap-2 rounded-[12px] border border-[var(--color-nav-dropdown-border)] bg-[var(--color-nav-dropdown-bg)] p-2">
      <input
        type="text"
        value={title}
        disabled={isBusy}
        aria-label={`${copy.librariesHeading} ${library.key}`}
        onChange={(event) => setTitle(event.target.value)}
        className="min-h-9 min-w-[10rem] flex-1 rounded-[9px] border border-[var(--color-nav-dropdown-border)] bg-[var(--color-bg)] px-3 text-[0.8125rem] text-[var(--color-text)] outline-none disabled:opacity-60"
      />
      {isDirty ? (
        <button
          type="button"
          disabled={isBusy || title.trim() === ''}
          onClick={() => onRename(library.key, title.trim())}
          className="rounded-[9px] border border-[var(--color-nav-item-active)] bg-[var(--color-nav-item-active)] px-2.5 py-1 text-[0.75rem] text-[var(--color-text)] disabled:opacity-50"
        >
          {copy.actionSave}
        </button>
      ) : null}
      <span className="text-[0.75rem] text-[var(--color-nav-muted)]">{library.memberCount}</span>
      <span className="rounded-full border border-[var(--color-nav-dropdown-border)] px-2 py-0.5 text-[0.68rem] text-[var(--color-nav-muted)]">
        {library.isActive ? copy.libraryActive : copy.libraryInactive}
      </span>
      <button
        type="button"
        aria-label={`${copy.actionMoveUp} ${library.key}`}
        disabled={isBusy || isFirst}
        onClick={() => onMove(library.key, -1)}
        className="rounded-full px-2 py-1 text-[0.75rem] text-[var(--color-nav-dropdown-description)] transition-colors hover:bg-[var(--color-nav-item-hover)] disabled:cursor-default disabled:opacity-40"
      >
        ↑
      </button>
      <button
        type="button"
        aria-label={`${copy.actionMoveDown} ${library.key}`}
        disabled={isBusy || isLast}
        onClick={() => onMove(library.key, 1)}
        className="rounded-full px-2 py-1 text-[0.75rem] text-[var(--color-nav-dropdown-description)] transition-colors hover:bg-[var(--color-nav-item-hover)] disabled:cursor-default disabled:opacity-40"
      >
        ↓
      </button>

      {library.isActive ? (
        isDeactivating ? (
          <span className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1 text-[0.72rem] text-[var(--color-nav-dropdown-description)]">
              {copy.libraryMoveMembersLabel}
              <select
                value={destination}
                disabled={isBusy}
                aria-label={`${copy.libraryMoveMembersLabel} ${library.key}`}
                onChange={(event) => setDestination(event.target.value)}
                className="min-h-8 rounded-[9px] border border-[var(--color-nav-dropdown-border)] bg-[var(--color-nav-dropdown-bg)] px-2 text-[0.75rem] text-[var(--color-text)] outline-none"
              >
                <option value="">—</option>
                {destinations.map((candidate) => (
                  <option key={candidate.key} value={candidate.key}>
                    {candidate.title}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={isBusy || (library.memberCount > 0 && destination === '')}
              onClick={() => onSetActive(library.key, false, destination === '' ? undefined : destination)}
              className="rounded-[9px] border border-[var(--color-nav-dropdown-border)] px-2.5 py-1 text-[0.75rem] text-[var(--color-text)] disabled:opacity-50"
            >
              {copy.libraryDeactivate}
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => setIsDeactivating(false)}
              className="rounded-[9px] px-2.5 py-1 text-[0.75rem] text-[var(--color-nav-dropdown-description)] hover:bg-[var(--color-nav-item-hover)]"
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
            className="rounded-[9px] border border-[var(--color-nav-dropdown-border)] px-2.5 py-1 text-[0.75rem] text-[var(--color-nav-dropdown-description)] transition-colors hover:bg-[var(--color-nav-item-hover)] disabled:opacity-50"
          >
            {copy.libraryDeactivate}
          </button>
        )
      ) : (
        <button
          type="button"
          disabled={isBusy}
          onClick={() => onSetActive(library.key, true)}
          className="rounded-[9px] border border-[var(--color-nav-dropdown-border)] px-2.5 py-1 text-[0.75rem] text-[var(--color-text)] transition-colors hover:bg-[var(--color-nav-item-hover)] disabled:opacity-50"
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
}: MusicLibraryEditorProps) {
  const [newName, setNewName] = useState('');

  return (
    <section className="space-y-3">
      <h4 className="text-[0.8125rem] font-medium text-[var(--color-text)]">{copy.librariesHeading}</h4>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={newName}
          aria-label={copy.newLibraryPlaceholder}
          placeholder={copy.newLibraryPlaceholder}
          onChange={(event) => setNewName(event.target.value)}
          className="min-h-9 min-w-[12rem] flex-1 rounded-[9px] border border-[var(--color-nav-dropdown-border)] bg-[var(--color-bg)] px-3 text-[0.8125rem] text-[var(--color-text)] outline-none"
        />
        <button
          type="button"
          disabled={isBusy || newName.trim() === ''}
          onClick={() => {
            onCreate(newName.trim());
            setNewName('');
          }}
          className="rounded-[10px] border border-[var(--color-nav-dropdown-border)] px-3 py-1.5 text-[0.8125rem] text-[var(--color-text)] transition-colors hover:bg-[var(--color-nav-item-hover)] disabled:opacity-50"
        >
          {copy.newLibraryAction}
        </button>
      </div>

      <ul className="space-y-2">
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
            />
          ))
        )}
      </ul>
    </section>
  );
}
