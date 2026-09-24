'use client';

import { useState, type FormEvent } from 'react';

import { ROADMAP_ENTRY_PRIORITIES, ROADMAP_ENTRY_TYPES, ROADMAP_STATUSES } from '../../domain';
import type { RoadmapEntryLink, RoadmapStatus } from '../../domain';
import type { RoadmapBoard } from '../../ports';
import { roadmapEndpoints } from '../../endpoints';

import type { RoadmapAdminChrome } from './roadmap-admin-chrome';

type RoadmapAdminPanelProps = {
  boards: RoadmapBoard[];
  chrome: RoadmapAdminChrome;
};

const inputClass =
  'rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-[0.85rem] text-[var(--color-text)]';
const buttonClass =
  'rounded-full border border-[var(--color-border)] px-3.5 py-2 text-[0.82rem] text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-text-soft)] hover:text-[var(--color-text)]';
const dangerButtonClass = `${buttonClass} border-[var(--roadmap-priority-high-bg)] text-[var(--roadmap-priority-high-fg)]`;
const labelClass = 'flex flex-col gap-1 text-[0.78rem] text-[var(--color-text-soft)]';

async function api(path: string, method: string, body?: unknown): Promise<void> {
  const response = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;

    throw new Error(payload?.error ?? `The request failed (${response.status}).`);
  }
}

function textOf(form: FormEvent<HTMLFormElement>, name: string): string {
  const data = new FormData(form.currentTarget as HTMLFormElement);

  return String(data.get(name) ?? '').trim();
}

function DeleteButton({
  chrome,
  onDelete,
}: {
  chrome: RoadmapAdminChrome;
  onDelete: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button type="button" className={dangerButtonClass} onClick={() => setConfirming(true)}>
        {chrome.deleteLabel}
      </button>
    );
  }

  return (
    <button
      type="button"
      className={dangerButtonClass}
      onClick={() => {
        setConfirming(true);
        void onDelete();
      }}
    >
      {chrome.confirmDelete}
    </button>
  );
}

function LinksEditor({
  links,
  onChange,
  chrome,
}: {
  links: RoadmapEntryLink[];
  onChange: (links: RoadmapEntryLink[]) => void;
  chrome: RoadmapAdminChrome;
}) {
  return (
    <div className="flex flex-col gap-2">
      {links.map((link, index) => (
        <div key={index} className="flex flex-wrap items-end gap-2">
          <label className={labelClass}>
            {chrome.labelEn}
            <input
              className={inputClass}
              value={link.label.en}
              onChange={(event) => {
                const next = [...links];

                next[index] = { ...link, label: { ...link.label, en: event.target.value } };
                onChange(next);
              }}
            />
          </label>
          <label className={labelClass}>
            {chrome.labelZh}
            <input
              className={inputClass}
              value={link.label.zh}
              onChange={(event) => {
                const next = [...links];

                next[index] = { ...link, label: { ...link.label, zh: event.target.value } };
                onChange(next);
              }}
            />
          </label>
          <label className={`${labelClass} grow`}>
            {chrome.fieldHref}
            <input
              className={inputClass}
              value={link.href}
              onChange={(event) => {
                const next = [...links];

                next[index] = { ...link, href: event.target.value };
                onChange(next);
              }}
            />
          </label>
          <button
            type="button"
            className={buttonClass}
            onClick={() => onChange(links.filter((_, position) => position !== index))}
          >
            {chrome.removeLink}
          </button>
        </div>
      ))}
      <button
        type="button"
        className={buttonClass}
        onClick={() =>
          onChange([...links, { label: { en: '', zh: '' }, href: '' }])
        }
      >
        {chrome.addLink}
      </button>
    </div>
  );
}

function EntryForm({
  board,
  entry,
  chrome,
  onSaved,
  onDeleted,
  onError,
}: {
  board: RoadmapBoard;
  entry: RoadmapBoard['entries'][number] | 'new';
  chrome: RoadmapAdminChrome;
  onSaved: () => Promise<void>;
  onDeleted: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const isNew = entry === 'new';
  const [links, setLinks] = useState<RoadmapEntryLink[]>(entry === 'new' ? [] : (entry.links ?? []));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const body = {
      ...(isNew ? { roadmapKey: board.roadmap.key, key: textOf(event, 'key') } : {}),
      status: textOf(event, 'status'),
      type: textOf(event, 'type'),
      priority: textOf(event, 'priority'),
      title: { en: textOf(event, 'titleEn'), zh: textOf(event, 'titleZh') },
      summary: { en: textOf(event, 'summaryEn'), zh: textOf(event, 'summaryZh') },
      order: Number(textOf(event, 'order')) || 0,
      links: links.filter((link) => link.href.trim() !== ''),
    };

    try {
      if (isNew) {
        await api(roadmapEndpoints.entries, 'POST', body);
      } else {
        await api(roadmapEndpoints.entry(entry.key), 'PATCH', body);
      }

      form.reset();
      await onSaved();
    } catch (error) {
      onError(error instanceof Error ? error.message : chrome.failed);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] p-4"
    >
      {isNew ? (
        <label className={labelClass}>
          {chrome.fieldKey}
          <input name="key" required className={inputClass} />
        </label>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <label className={labelClass}>
          {chrome.titleEn}
          <input
            name="titleEn"
            required
            className={inputClass}
            defaultValue={isNew ? '' : entry.title.en}
          />
        </label>
        <label className={labelClass}>
          {chrome.titleZh}
          <input
            name="titleZh"
            required
            className={inputClass}
            defaultValue={isNew ? '' : entry.title.zh}
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <label className={labelClass}>
          {chrome.summaryEn}
          <input
            name="summaryEn"
            required
            className={inputClass}
            defaultValue={isNew ? '' : entry.summary.en}
          />
        </label>
        <label className={labelClass}>
          {chrome.summaryZh}
          <input
            name="summaryZh"
            required
            className={inputClass}
            defaultValue={isNew ? '' : entry.summary.zh}
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <label className={labelClass}>
          {chrome.fieldStatus}
          <select
            name="status"
            className={inputClass}
            defaultValue={isNew ? board.roadmap.columns[0]?.status : entry.status}
          >
            {board.roadmap.columns.map((column) => (
              <option key={column.status} value={column.status}>
                {column.label.en} / {column.label.zh}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          {chrome.fieldType}
          <select
            name="type"
            className={inputClass}
            defaultValue={isNew ? 'feature' : entry.type}
          >
            {ROADMAP_ENTRY_TYPES.map((type) => (
              <option key={type} value={type}>
                {chrome.typeLabels[type]}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          {chrome.fieldPriority}
          <select
            name="priority"
            className={inputClass}
            defaultValue={isNew ? 'none' : entry.priority}
          >
            {ROADMAP_ENTRY_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {chrome.priorityLabels[priority]}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          {chrome.fieldOrder}
          <input
            name="order"
            type="number"
            className={`${inputClass} w-24`}
            defaultValue={isNew ? 0 : entry.order}
          />
        </label>
      </div>
      <LinksEditor links={links} onChange={setLinks} chrome={chrome} />
      <div className="flex gap-2">
        <button type="submit" className={buttonClass}>
          {isNew ? chrome.create : chrome.update}
        </button>
        {isNew ? null : (
          <DeleteButton
            chrome={chrome}
            onDelete={async () => {
              try {
                await api(roadmapEndpoints.entry(entry.key), 'DELETE');
                await onDeleted();
              } catch (error) {
                onError(error instanceof Error ? error.message : chrome.failed);
              }
            }}
          />
        )}
      </div>
    </form>
  );
}

export function RoadmapAdminPanel({ boards: initialBoards, chrome }: RoadmapAdminPanelProps) {
  const [boards, setBoards] = useState(initialBoards);
  const [selectedKey, setSelectedKey] = useState<string | null>(initialBoards[0]?.roadmap.key ?? null);
  const [error, setError] = useState<string | null>(null);
  const selected = boards.find((board) => board.roadmap.key === selectedKey) ?? null;

  async function refresh(): Promise<void> {
    const response = await fetch(roadmapEndpoints.roadmaps);
    const payload = (await response.json()) as { boards: RoadmapBoard[] };

    setBoards(payload.boards);
  }

  function report(message: string): void {
    setError(message);
  }

  async function run(action: () => Promise<void>): Promise<void> {
    try {
      setError(null);
      await action();
      await refresh();
    } catch (error) {
      report(error instanceof Error ? error.message : chrome.failed);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-6 px-6 py-10">
      <h1 className="text-[1.6rem] font-semibold text-[var(--color-text)]">{chrome.heading}</h1>
      {error ? (
        <p className="rounded-[var(--radius-md)] border border-[var(--roadmap-priority-high-bg)] px-4 py-3 text-[0.85rem] text-[var(--roadmap-priority-high-fg)]">
          {error}
        </p>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[280px_1fr_1.4fr]">
        <section aria-label={chrome.boardsLabel} className="flex flex-col gap-4">
          <h2 className="text-[0.95rem] font-medium text-[var(--color-text)]">{chrome.boardsLabel}</h2>
          <form
            className="flex flex-col gap-2"
            onSubmit={(event) =>
              run(async () => {
                event.preventDefault();
                await api(roadmapEndpoints.roadmaps, 'POST', {
                  key: textOf(event, 'key'),
                  name: { en: textOf(event, 'nameEn'), zh: textOf(event, 'nameZh') },
                });
                (event.currentTarget as HTMLFormElement).reset();
              })
            }
          >
            <label className={labelClass}>
              {chrome.fieldKey}
              <input name="key" required className={inputClass} />
            </label>
            <label className={labelClass}>
              {chrome.nameEn}
              <input name="nameEn" required className={inputClass} />
            </label>
            <label className={labelClass}>
              {chrome.nameZh}
              <input name="nameZh" required className={inputClass} />
            </label>
            <button type="submit" className={buttonClass}>
              {chrome.create}
            </button>
          </form>
          <ul className="flex flex-col gap-2">
            {boards.map((board) => (
              <li key={board.roadmap.key}>
                <button
                  type="button"
                  aria-pressed={board.roadmap.key === selectedKey}
                  onClick={() => setSelectedKey(board.roadmap.key)}
                  className={`${buttonClass} w-full justify-start ${
                    board.roadmap.key === selectedKey ? 'border-[var(--color-text-soft)]' : ''
                  }`}
                >
                  {board.roadmap.name.en} / {board.roadmap.name.zh}
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section aria-label={chrome.columnsLabel} className="flex flex-col gap-4">
          <h2 className="text-[0.95rem] font-medium text-[var(--color-text)]">{chrome.columnsLabel}</h2>
          {selected ? (
            <>
              <form
                className="flex flex-col gap-2"
                onSubmit={(event) =>
                  run(async () => {
                    event.preventDefault();
                    await api(roadmapEndpoints.roadmap(selected.roadmap.key), 'PATCH', {
                      name: { en: textOf(event, 'nameEn'), zh: textOf(event, 'nameZh') },
                    });
                  })
                }
              >
                <label className={labelClass}>
                  {chrome.nameEn}
                  <input
                    name="nameEn"
                    required
                    className={inputClass}
                    defaultValue={selected.roadmap.name.en}
                  />
                </label>
                <label className={labelClass}>
                  {chrome.nameZh}
                  <input
                    name="nameZh"
                    required
                    className={inputClass}
                    defaultValue={selected.roadmap.name.zh}
                  />
                </label>
                <div className="flex gap-2">
                  <button type="submit" className={buttonClass}>
                    {chrome.update}
                  </button>
                  <DeleteButton
                    chrome={chrome}
                    onDelete={() =>
                      run(async () => {
                        await api(roadmapEndpoints.roadmap(selected.roadmap.key), 'DELETE');
                        setSelectedKey(null);
                      })
                    }
                  />
                </div>
              </form>
              {selected.roadmap.columns.map((column) => (
                <form
                  key={column.status}
                  className="flex flex-wrap items-end gap-2 border-t border-[var(--color-border)] pt-3"
                  onSubmit={(event) =>
                    run(async () => {
                      event.preventDefault();
                      await api(
                        roadmapEndpoints.column(selected.roadmap.key, column.status),
                        'PATCH',
                        {
                          label: { en: textOf(event, 'labelEn'), zh: textOf(event, 'labelZh') },
                        },
                      );
                    })
                  }
                >
                  <span className={`${labelClass} w-28`}>{chrome.statusLabels[column.status]}</span>
                  <label className={labelClass}>
                    {chrome.labelEn}
                    <input name="labelEn" required className={inputClass} defaultValue={column.label.en} />
                  </label>
                  <label className={labelClass}>
                    {chrome.labelZh}
                    <input name="labelZh" required className={inputClass} defaultValue={column.label.zh} />
                  </label>
                  <button type="submit" className={buttonClass}>
                    {chrome.update}
                  </button>
                  <DeleteButton
                    chrome={chrome}
                    onDelete={() =>
                      run(() =>
                        api(roadmapEndpoints.column(selected.roadmap.key, column.status), 'DELETE'),
                      )
                    }
                  />
                </form>
              ))}
              <form
                className="flex flex-wrap items-end gap-2 border-t border-[var(--color-border)] pt-3"
                onSubmit={(event) =>
                  run(async () => {
                    event.preventDefault();
                    await api(roadmapEndpoints.columns, 'POST', {
                      roadmapKey: selected.roadmap.key,
                      status: textOf(event, 'status'),
                      label: { en: textOf(event, 'labelEn'), zh: textOf(event, 'labelZh') },
                    });
                  })
                }
              >
                <label className={labelClass}>
                  {chrome.fieldStatus}
                  <select name="status" className={inputClass} defaultValue="reviewing">
                    {ROADMAP_STATUSES.map((status: RoadmapStatus) => (
                      <option key={status} value={status}>
                        {chrome.statusLabels[status]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={labelClass}>
                  {chrome.labelEn}
                  <input name="labelEn" required className={inputClass} />
                </label>
                <label className={labelClass}>
                  {chrome.labelZh}
                  <input name="labelZh" required className={inputClass} />
                </label>
                <button type="submit" className={buttonClass}>
                  {chrome.create}
                </button>
              </form>
            </>
          ) : (
            <p className="text-[0.85rem] text-[var(--color-text-soft)]">{chrome.emptySelection}</p>
          )}
        </section>

        <section aria-label={chrome.entriesLabel} className="flex flex-col gap-4">
          <h2 className="text-[0.95rem] font-medium text-[var(--color-text)]">{chrome.entriesLabel}</h2>
          {selected ? (
            <>
              <EntryForm
                board={selected}
                entry="new"
                chrome={chrome}
                onSaved={refresh}
                onDeleted={refresh}
                onError={report}
              />
              {selected.entries.map((entry) => (
                <EntryForm
                  key={entry.key}
                  board={selected}
                  entry={entry}
                  chrome={chrome}
                  onSaved={refresh}
                  onDeleted={refresh}
                  onError={report}
                />
              ))}
            </>
          ) : (
            <p className="text-[0.85rem] text-[var(--color-text-soft)]">{chrome.emptySelection}</p>
          )}
        </section>
      </div>
    </div>
  );
}
