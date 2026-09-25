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
    <section className="ml-4 max-w-[744px] space-y-3">
      <h4 className="text-[0.8125rem] font-medium text-[var(--color-text)]">{copy.uploadHeading}</h4>

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
        className={`rounded-[12px] border border-dashed p-4 transition-colors ${
          isDragging
            ? 'border-[var(--badge-sky-border)] bg-[var(--badge-sky-bg)]'
            : 'border-[var(--color-border)] bg-[color:var(--color-row-bg)]'
        }`}
      >
        <p className="text-[0.75rem] leading-5 text-[var(--color-nav-dropdown-description)]">
          {copy.uploadHint}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!canUpload}
            onClick={() => fileInputRef.current?.click()}
            className="rounded-[10px] bg-[var(--color-pill-active-bg)] px-3 py-1.5 text-[0.8125rem] font-medium text-[var(--color-text)] shadow-[var(--shadow-pill-active)] transition-colors hover:bg-[color:var(--color-row-hover-bg)] disabled:cursor-default disabled:opacity-50"
          >
            {copy.chooseFiles}
          </button>
          <button
            type="button"
            disabled={!canUpload}
            onClick={() => folderInputRef.current?.click()}
            className="rounded-[10px] bg-[var(--color-pill-active-bg)] px-3 py-1.5 text-[0.8125rem] font-medium text-[var(--color-text)] shadow-[var(--shadow-pill-active)] transition-colors hover:bg-[color:var(--color-row-hover-bg)] disabled:cursor-default disabled:opacity-50"
          >
            {copy.chooseFolder}
          </button>

          <label className="ml-auto flex items-center gap-2 text-[0.75rem] text-[var(--color-nav-dropdown-description)]">
            {copy.uploadLibraryLabel}
            <MusicSelect
              value={selectedLibrary}
              disabled={!canUpload}
              ariaLabel={copy.uploadLibraryLabel}
              onChange={onSelectLibrary}
              options={activeLibraries.map((library) => ({
                value: library.key,
                label: library.title,
              }))}
              className="min-w-[7.25rem]"
              buttonClassName="h-9 text-[0.8125rem]"
            />
          </label>
        </div>

        {activeLibraries.length === 0 ? (
          <p className="mt-1 text-[0.75rem] text-[var(--color-nav-muted)]">{copy.uploadNeedsLibrary}</p>
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
        <details className="rounded-[10px] border border-[var(--color-nav-dropdown-border)] px-3 py-2">
          <summary className="cursor-pointer truncate text-[0.75rem] text-[var(--color-text)]">
            {copy.formatUploadSkipped(skipped[0].filename, skipped.length)}
          </summary>
          <ul className="mt-1 max-h-40 space-y-1 overflow-y-auto">
            {skipped.map((entry) => (
              <li
                key={entry.id}
                className="truncate text-[0.75rem] text-[var(--color-nav-dropdown-description)]"
              >
                {entry.filename}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {items.length > 0 ? (
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-2 text-[0.75rem]">
              <span className="min-w-0 flex-1 truncate text-[var(--color-text)]">{item.filename}</span>
              <span
                className={
                  item.status === 'failed'
                    ? 'text-[var(--color-text)]'
                    : 'text-[var(--color-nav-dropdown-description)]'
                }
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
