'use client';

import { useRef, useState } from 'react';

import type { MusicAdminLibrary, MusicAdminTrack } from '@/server/music/music-admin';

import type { MusicAdminCopy } from './music-admin-copy';
import { uploadMusicFile } from './music-upload-client';

type UploadItemStatus = 'queued' | 'uploading' | 'done' | 'failed';

type UploadItem = {
  id: string;
  filename: string;
  status: UploadItemStatus;
  percent: number;
  error: string | null;
};

type MusicUploadZoneProps = {
  copy: MusicAdminCopy;
  libraries: MusicAdminLibrary[];
  selectedLibrary: string;
  onSelectLibrary: (key: string) => void;
  ensureLibrary: (name: string) => Promise<string>;
  onUploaded: (track: MusicAdminTrack) => void;
};

const ACCEPT = '.mp3,.wav,.flac,audio/mpeg,audio/wav,audio/flac';

function folderNameOf(file: File): string | null {
  const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath ?? '';
  const segment = relative.split('/')[0] ?? '';

  if (segment === '') return null;

  // 目录名常见数字前缀 01-xx 与生成器同一约定：只作为顺序提示，不进名字
  const match = /^(\d+)-(.+)$/.exec(segment);

  return match ? match[2] : segment;
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
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const activeLibraries = libraries.filter((library) => library.isActive);
  const canUpload = activeLibraries.length > 0 && !isUploading;

  const updateItem = (id: string, patch: Partial<UploadItem>) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const runUploads = async (jobs: Array<{ file: File; libraryKey: string }>) => {
    if (jobs.length === 0) return;

    const entries = jobs.map((job) => ({
      ...job,
      id: `${job.file.name}-${job.file.size}-${Math.random().toString(36).slice(2, 8)}`,
    }));

    setItems((current) => [
      ...current,
      ...entries.map((entry) => ({
        id: entry.id,
        filename: entry.file.name,
        status: 'queued' as const,
        percent: 0,
        error: null,
      })),
    ]);
    setIsUploading(true);

    for (const entry of entries) {
      updateItem(entry.id, { status: 'uploading', percent: 0, error: null });

      try {
        const result = await uploadMusicFile(entry.file, entry.libraryKey, {
          onProgress: (percent) => updateItem(entry.id, { percent }),
        });

        updateItem(entry.id, { status: 'done', percent: 100 });
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

    const byFolder = new Map<string | null, File[]>();

    for (const file of files) {
      const folder = folderNameOf(file);
      byFolder.set(folder, [...(byFolder.get(folder) ?? []), file]);
    }

    const jobs: Array<{ file: File; libraryKey: string }> = [];

    try {
      for (const [folder, folderFiles] of byFolder) {
        const libraryKey = folder === null ? selectedLibrary : await ensureLibrary(folder);

        for (const file of folderFiles) {
          jobs.push({ file, libraryKey });
        }
      }
    } catch (error) {
      setItems((current) => [
        ...current,
        ...files.map((file) => ({
          id: `${file.name}-failed`,
          filename: file.name,
          status: 'failed' as const,
          percent: 0,
          error: error instanceof Error ? error.message : String(error),
        })),
      ]);

      return;
    }

    await runUploads(jobs);
  };

  return (
    <section className="space-y-3">
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
            ? 'border-[var(--color-nav-item-active)] bg-[var(--color-nav-item-hover)]'
            : 'border-[var(--color-nav-dropdown-border)]'
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
            className="rounded-[10px] border border-[var(--color-nav-dropdown-border)] px-3 py-1.5 text-[0.8125rem] text-[var(--color-text)] transition-colors hover:bg-[var(--color-nav-item-hover)] disabled:cursor-default disabled:opacity-50"
          >
            {copy.chooseFiles}
          </button>
          <button
            type="button"
            disabled={!canUpload}
            onClick={() => folderInputRef.current?.click()}
            className="rounded-[10px] border border-[var(--color-nav-dropdown-border)] px-3 py-1.5 text-[0.8125rem] text-[var(--color-text)] transition-colors hover:bg-[var(--color-nav-item-hover)] disabled:cursor-default disabled:opacity-50"
          >
            {copy.chooseFolder}
          </button>

          <label className="ml-auto flex items-center gap-2 text-[0.75rem] text-[var(--color-nav-dropdown-description)]">
            {copy.uploadLibraryLabel}
            <select
              value={selectedLibrary}
              disabled={!canUpload}
              onChange={(event) => onSelectLibrary(event.target.value)}
              className="min-h-9 rounded-[9px] border border-[var(--color-nav-dropdown-border)] bg-[var(--color-nav-dropdown-bg)] px-2 text-[0.8125rem] text-[var(--color-text)] outline-none disabled:opacity-50"
            >
              {activeLibraries.map((library) => (
                <option key={library.key} value={library.key}>
                  {library.title}
                </option>
              ))}
            </select>
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
                      ? copy.uploadDone
                      : `${copy.uploadFailed}${item.error ? `: ${item.error}` : ''}`}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
