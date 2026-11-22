'use client';

import type { MusicDuplicateHint } from '@incept/music/domain';
import { useRef, useState } from 'react';

import type { MusicAdminLibrary, MusicAdminTrack } from '@incept/music/application';

import type { MusicAdminCopy } from './music-admin-copy';
import { partitionMusicUploadFiles } from './music-upload-filter';
import { MusicSelect } from './music-select';
import { uploadMusicFile, type UploadResult } from './music-upload-client';

type UploadItemStatus = 'queued' | 'uploading' | 'done' | 'failed';

type UploadItemNote = 'uploaded' | 'reused' | 'existing' | 'membership-added' | 'deactivated';

type UploadItem = {
  id: string;
  filename: string;
  status: UploadItemStatus;
  percent: number;
  error: string | null;
  note: UploadItemNote | null;
  duplicates: MusicDuplicateHint[];
};

type SkippedItem = {
  id: string;
  filename: string;
};

type MusicUploadZoneProps = {
  copy: MusicAdminCopy;
  libraries: MusicAdminLibrary[];
  selectedLibrary: string;
  onSelectLibrary: (key: string) => void;
  ensureLibrary: (name: string) => Promise<string>;
  onUploaded: (track: MusicAdminTrack) => void;
};

const ACCEPT = '.mp3,.wav,.flac,.ncm,audio/mpeg,audio/wav,audio/flac';

function folderNameOf(file: File): string | null {
  const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath ?? '';
  const segment = relative.split('/')[0] ?? '';

  if (segment === '') return null;

  // 目录名常见数字前缀 01-xx 与生成器同一约定：只作为顺序提示，不进名字
  const match = /^(\d+)-(.+)$/.exec(segment);

  return match ? match[2] : segment;
}

function itemId(filename: string): string {
  return `${filename}-${Math.random().toString(36).slice(2, 8)}`;
}

function noteOf(result: UploadResult): UploadItemNote {
  if (result.trackStatus === 'existing') return 'existing';
  if (result.trackStatus === 'membership-added') return 'membership-added';
  if (result.trackStatus === 'deactivated') return 'deactivated';

  return result.mediaStatus === 'reused' ? 'reused' : 'uploaded';
}

function formatNote(item: UploadItem, copy: MusicAdminCopy): string {
  const label =
    item.note === 'reused'
      ? copy.uploadDoneReused
      : item.note === 'existing'
        ? copy.uploadDoneExisting
        : item.note === 'membership-added'
          ? copy.uploadDoneMembershipAdded
          : item.note === 'deactivated'
            ? copy.uploadDoneDeactivated
            : copy.uploadDone;

  if (item.duplicates.length === 0) return label;

  return `${label} · ${copy.formatUploadDuplicateHint(item.duplicates.map((hint) => hint.title))}`;
}

export function MusicUploadZone({
  copy,
  libraries,
  selectedLibrary,
  onSelectLibrary,
  ensureLibrary,
  onUploaded,
}: MusicUploadZoneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [skipped, setSkipped] = useState<SkippedItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const activeLibraries = libraries.filter((library) => library.isActive);
  const canUpload = activeLibraries.length > 0 && !isUploading;

  const updateItem = (id: string, patch: Partial<UploadItem>) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const runUploads = async (jobs: Array<{ file: File; libraryKey: string }>) => {
    if (jobs.length === 0) return;

    const entries = jobs.map((job) => ({ ...job, id: itemId(job.file.name) }));

    setItems((current) => [
      ...current,
      ...entries.map((entry) => ({
        id: entry.id,
        filename: entry.file.name,
        status: 'queued' as const,
        percent: 0,
        error: null,
        note: null,
        duplicates: [] as MusicDuplicateHint[],
      })),
    ]);
    setIsUploading(true);

    for (const entry of entries) {
      updateItem(entry.id, { status: 'uploading', percent: 0, error: null });

      try {
        const result = await uploadMusicFile(entry.file, entry.libraryKey, {
          onProgress: (percent) => updateItem(entry.id, { percent }),
        });

        updateItem(entry.id, {
          status: 'done',
          percent: 100,
          note: noteOf(result),
          duplicates: result.duplicates,
        });
        onUploaded(result.track);
      } catch (error) {
        updateItem(entry.id, {
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    setIsUploading(false);
  };

  const handleFileList = async (files: File[]) => {
    if (files.length === 0 || !canUpload) return;

    // 白名单之外的先分流：只汇总提示，不参与建库与上传
    const { candidates, skipped: skippedFiles } = partitionMusicUploadFiles(files);

    if (skippedFiles.length > 0) {
      setSkipped((current) => [
        ...current,
        ...skippedFiles.map((file) => ({ id: itemId(file.name), filename: file.name })),
      ]);
    }

    if (candidates.length === 0) return;

    const byFolder = new Map<string | null, File[]>();

    for (const file of candidates) {
      const folder = folderNameOf(file);
      byFolder.set(folder, [...(byFolder.get(folder) ?? []), file]);
    }

    const jobs: Array<{ file: File; libraryKey: string }> = [];

    try {
      for (const [folder, folderFiles] of byFolder) {
        // 只有含候选文件的目录才建库
        const libraryKey = folder === null ? selectedLibrary : await ensureLibrary(folder);

        for (const file of folderFiles) {
          jobs.push({ file, libraryKey });
        }
      }
    } catch (error) {
      setItems((current) => [
        ...current,
        ...candidates.map((file) => ({
          id: itemId(file.name),
          filename: file.name,
          status: 'failed' as const,
          percent: 0,
          error: error instanceof Error ? error.message : String(error),
          note: null,
          duplicates: [] as MusicDuplicateHint[],
        })),
      ]);

      return;
    }

    await runUploads(jobs);
  };

  return (
    <section id="music-upload" className="space-y-3">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          void handleFileList(Array.from(event.dataTransfer.files));
        }}
        className={`flex flex-col gap-3 rounded-[10px] border border-dashed px-4 py-3.5 transition-colors ${
          isDragging
            ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]'
            : 'border-[var(--color-border-strong)] bg-transparent hover:bg-[var(--color-surface-subtle)]'
        }`}
      >
        <div className="min-w-0 space-y-0.5">
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 16 16" className="size-3.5 shrink-0 text-[var(--color-text-muted)]" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M4.5 12.5H12a2.5 2.5 0 0 0 .5-4.95A3.5 3.5 0 0 0 6.1 4.7 2.75 2.75 0 0 0 2 7.25a2.75 2.75 0 0 0 2.5 5.25Z" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M8 7v4.5M6 9l2-2 2 2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <h4 className="text-[length:var(--text-sm)] font-medium text-[var(--color-text)]">{copy.uploadHeading}</h4>
          </div>
          <p className="text-[length:var(--text-xs)] leading-5 text-[var(--color-text-muted)]">
            {copy.uploadHint}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!canUpload}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-card,var(--color-bg))] px-3 text-[length:var(--text-xs)] font-medium text-[var(--color-text)] transition-colors hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-hover)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
            >
              {copy.chooseFiles}
            </button>
            <button
              type="button"
              disabled={!canUpload}
              onClick={() => folderInputRef.current?.click()}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-card,var(--color-bg))] px-3 text-[length:var(--text-xs)] font-medium text-[var(--color-text)] transition-colors hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-hover)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
            >
              {copy.chooseFolder}
            </button>
          </div>

          <label className="flex items-center gap-1.5 text-[length:var(--text-xs)] text-[var(--color-text-muted)]">
            <span className="sr-only sm:not-sr-only">{copy.uploadLibraryLabel}</span>
            <MusicSelect
              value={selectedLibrary}
              disabled={!canUpload}
              ariaLabel={copy.uploadLibraryLabel}
              onChange={onSelectLibrary}
              options={activeLibraries.map((library) => ({
                value: library.key,
                label: library.title,
              }))}
              className="min-w-[6.75rem]"
              buttonClassName="h-8 rounded-[8px] text-[length:var(--text-xs)]"
            />
          </label>
        </div>

        {activeLibraries.length === 0 ? (
          <p className="w-full text-[length:var(--text-xs)] text-[var(--badge-amber-fg)]">{copy.uploadNeedsLibrary}</p>
        ) : null}

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPT}
          aria-label={copy.chooseFiles}
          className="hidden"
          onChange={(event) => {
            void handleFileList(Array.from(event.target.files ?? []));
            event.target.value = '';
          }}
        />
        <input
          ref={folderInputRef}
          type="file"
          multiple
          aria-label={copy.chooseFolder}
          className="hidden"
          {...({ webkitdirectory: 'true' } as Record<string, string>)}
          onChange={(event) => {
            void handleFileList(Array.from(event.target.files ?? []));
            event.target.value = '';
          }}
        />
      </div>

      {/* 无关文件只留一行概括，完整名单收在折叠里 */}
      {skipped.length > 0 ? (
        <details className="rounded-[10px] border border-[var(--color-border-faint)] bg-[var(--color-surface-card,var(--color-bg))] px-3.5 py-2.5">
          <summary className="cursor-pointer truncate text-[length:var(--text-xs)] font-medium text-[var(--color-text)]">
            {copy.formatUploadSkipped(skipped[0].filename, skipped.length)}
          </summary>
          <ul className="mt-2 max-h-40 space-y-1.5 overflow-y-auto border-t border-[var(--color-border-faint)] pt-2">
            {skipped.map((entry) => (
              <li
                key={entry.id}
                className="truncate text-[length:var(--text-xs)] text-[var(--color-text-muted)]"
              >
                {entry.filename}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {items.length > 0 ? (
        <ul className="divide-y divide-[var(--color-border-faint)] pt-1">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 py-2 text-[length:var(--text-xs)] first:pt-0 last:pb-0">
              <span className="min-w-0 flex-1 truncate font-medium text-[var(--color-text)]">{item.filename}</span>
              <span
                className={`shrink-0 ${
                  item.status === 'failed'
                    ? 'font-medium text-[var(--badge-rose-fg)]'
                    : item.status === 'done'
                      ? 'text-[var(--badge-emerald-fg)]'
                      : 'text-[var(--color-text-muted)]'
                }`}
              >
                {item.status === 'queued'
                  ? copy.uploadQueued
                  : item.status === 'uploading'
                    ? copy.formatUploadProgress(item.percent)
                    : item.status === 'done'
                      ? formatNote(item, copy)
                      : `${copy.uploadFailed}${item.error ? `: ${item.error}` : ''}`}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
