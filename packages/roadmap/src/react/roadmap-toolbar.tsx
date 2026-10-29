'use client';

import { useEffect, useRef, useState } from 'react';

import type { RoadmapLocale, RoadmapProject } from '../domain';

import { roadmapEndpoints } from '../endpoints';
import type { RoadmapChrome } from './copy';
import { IconChevronDown, IconImport, IconProjectTag } from './icons';
import { roadmapRequest } from './request';

type RoadmapToolbarProps = {
  projects: readonly RoadmapProject[];
  currentProjectKey: string;
  activeSurface?: 'roadmap' | 'atlas';
  currentRoadmapKey?: string;
  locale: RoadmapLocale;
  chrome: RoadmapChrome;
  canEdit: boolean;
  hrefs: Record<string, string>;
  onChanged?: () => void;
  showProjectSelector?: boolean;
  // 空列新建入口：排在 Import 左侧，由宿主在“首个阶段列为空”时注入。
  onCreateEntry?: () => void;
  createEntryLabel?: string;
};

// 顶栏操作区：提供基于人工 JSON 清单的追加导入与项目切换功能。
// history: 导入自动附带当前项目、表面与看板标识；反馈提示升级为右上方浮动 Toast。
export function RoadmapToolbar({
  projects,
  currentProjectKey,
  activeSurface,
  currentRoadmapKey,
  locale,
  chrome,
  canEdit,
  hrefs,
  onChanged,
  showProjectSelector = true,
  onCreateEntry,
  createEntryLabel,
}: RoadmapToolbarProps) {
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<{
    type: 'success' | 'error';
    eyebrow: string;
    title: string;
    description: string;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(
      () => {
        setToast(null);
      },
      toast.type === 'error' ? 6000 : 4200,
    );
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const activeProjectName =
    projects.find((item) => item.key === currentProjectKey)?.name[locale] ??
    chrome.projectSelectLabel ??
    '';

  async function handleImportFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    event.target.value = '';
    if (!file) return;

    const query = new URLSearchParams();
    if (currentProjectKey) query.set('projectKey', currentProjectKey);
    if (activeSurface) query.set('surface', activeSurface);
    if (currentRoadmapKey) query.set('roadmapKey', currentRoadmapKey);
    const queryString = query.toString();
    const endpoint = queryString ? `${roadmapEndpoints.import}?${queryString}` : roadmapEndpoints.import;

    try {
      const manifest: unknown = JSON.parse(await file.text());

      const result = await roadmapRequest<{ entries: unknown[] }>(endpoint, 'POST', manifest);
      const count = result?.entries?.length ?? 0;
      setToast({
        type: 'success',
        eyebrow:
          chrome.importSuccessEyebrow ??
          chrome.importSucceeded ??
          (locale === 'zh' ? '导入完成' : 'Import complete'),
        title: chrome.importSuccessTitle ?? (locale === 'zh' ? '条目已追加' : 'Entries appended'),
        description:
          chrome.importSuccessDescription ??
          (locale === 'zh'
            ? `已成功向当前看板追加 ${count} 个条目`
            : `Successfully appended ${count} entries to the current board.`),
      });
      onChanged?.();
    } catch (error) {
      setToast({
        type: 'error',
        eyebrow:
          chrome.importErrorEyebrow ??
          chrome.importFailed ??
          (locale === 'zh' ? '导入未完成' : 'Import failed'),
        title: chrome.importErrorTitle ?? (locale === 'zh' ? '未能导入条目' : 'Could not import entries'),
        description:
          error instanceof Error && error.message
            ? error.message
            : (chrome.importFailed ?? (locale === 'zh' ? '导入失败，请检查文件格式' : 'Import failed.')),
      });
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      {canEdit && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(event) => void handleImportFile(event)}
          />
          {onCreateEntry && (
            <button
              type="button"
              onClick={onCreateEntry}
              aria-label={createEntryLabel ?? 'New entry'}
              title={createEntryLabel ?? 'New entry'}
              className="inline-flex size-[30px] shrink-0 items-center justify-center rounded-full border border-[var(--roadmap-border,var(--color-border))] bg-[var(--roadmap-card-bg,var(--color-bg))] text-[var(--color-text-muted)] shadow-[0_1px_2px_rgba(15,23,42,0.05)] transition-colors hover:border-[var(--roadmap-border-hover,var(--color-text-soft))] hover:bg-[var(--roadmap-card-hover-bg,var(--roadmap-lane-bg))] hover:text-[var(--color-text)]"
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 14 14"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M7 2.75v8.5M2.75 7h8.5" />
              </svg>
            </button>
          )}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--roadmap-border,var(--color-border))] bg-[var(--roadmap-card-bg,var(--color-bg))] px-3.5 py-1.5 text-[0.8rem] font-medium text-[var(--color-text)] shadow-[0_1px_2px_rgba(15,23,42,0.05)] transition-colors hover:border-[var(--roadmap-border-hover,var(--color-text-soft))] hover:bg-[var(--roadmap-card-hover-bg,var(--roadmap-lane-bg))]"
          >
            <span aria-hidden="true" className="inline-flex shrink-0 text-[var(--color-text-muted)]">
              <IconImport />
            </span>
            {chrome.importLabel}
          </button>
          {toast && (
            <div className="pointer-events-none fixed right-5 top-[calc(var(--navbar-height,64px)+1rem)] z-50 w-[min(28rem,calc(100vw-2.5rem))]">
              <div
                className={`pointer-events-auto rounded-[0.8rem] border px-4 py-3 shadow-[0_16px_40px_rgba(15,23,42,0.08)] backdrop-blur ${
                  toast.type === 'success'
                    ? 'border-emerald-200/70 bg-white/96 dark:border-emerald-500/20 dark:bg-[#101713]/96 dark:shadow-none'
                    : 'border-rose-200/70 bg-white/96 dark:border-rose-500/20 dark:bg-[#181012]/96 dark:shadow-none'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p
                    className={`text-[0.74rem] font-medium uppercase tracking-[0.18em] ${
                      toast.type === 'success'
                        ? 'text-emerald-700 dark:text-emerald-300'
                        : 'text-rose-700 dark:text-rose-300'
                    }`}
                  >
                    {toast.eyebrow}
                  </p>
                  <button
                    type="button"
                    onClick={() => setToast(null)}
                    aria-label={locale === 'zh' ? '关闭提示' : 'Dismiss notification'}
                    className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] -mr-1 -mt-1 p-1 text-[0.85rem] leading-none"
                  >
                    ✕
                  </button>
                </div>
                <p className="mt-1.5 text-[0.96rem] font-medium text-[var(--color-text)]">
                  {toast.title}
                </p>
                <p className="mt-1 text-[0.9rem] leading-6 text-[var(--color-text-soft)] break-words">
                  {toast.description}
                </p>
              </div>
            </div>
          )}
        </>
      )}

      {showProjectSelector && <div ref={containerRef} className="relative">
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((prev) => !prev)}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--roadmap-border,var(--color-border))] bg-[var(--roadmap-card-bg,var(--roadmap-lane-bg))] px-3.5 py-1.5 text-[0.8rem] font-medium text-[var(--color-text)] shadow-[0_1px_2px_rgba(15,23,42,0.05)] transition-colors hover:border-[var(--roadmap-border-hover,var(--color-text-soft))] hover:bg-[var(--roadmap-card-hover-bg,var(--roadmap-lane-bg))]"
        >
          <span
            aria-hidden="true"
            className="inline-flex shrink-0 text-[var(--roadmap-status-active,#2563eb)]"
          >
            <IconProjectTag />
          </span>
          <span>{activeProjectName}</span>
          <span
            aria-hidden="true"
            className={`inline-flex shrink-0 text-[var(--color-text-soft)] transition-transform duration-150 ${
              open ? 'rotate-180' : ''
            }`}
          >
            <IconChevronDown />
          </span>
        </button>

        {open && (
          <ul
            role="listbox"
            aria-label={chrome.projectSelectLabel}
            className="absolute right-0 z-20 mt-1.5 min-w-[168px] rounded-[10px] border border-[var(--roadmap-border,var(--color-border))] bg-[var(--roadmap-popover-bg,var(--color-bg))] p-1 shadow-[0_12px_32px_rgba(0,0,0,0.22)]"
          >
            {projects.map((project) => {
              const selected = currentProjectKey === project.key;

              return (
                <li key={project.key} role="option" aria-selected={selected} className="list-none">
                  <a
                    href={hrefs[project.key]}
                    onClick={() => setOpen(false)}
                    className={`flex w-full items-center justify-between rounded-[6px] px-3 py-1.5 text-left text-[0.8rem] transition-colors ${
                      selected
                        ? 'bg-[var(--roadmap-chip-bg)] font-medium text-[var(--color-text)]'
                        : 'text-[var(--color-text-muted)] hover:bg-[var(--roadmap-chip-bg)] hover:text-[var(--color-text)]'
                    }`}
                  >
                    <span>{project.name[locale]}</span>
                    {selected && (
                      <span
                        aria-hidden="true"
                        className="size-1.5 rounded-full bg-[var(--roadmap-status-active,#2563eb)]"
                      />
                    )}
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </div>}
    </div>
  );
}
