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
  locale: RoadmapLocale;
  chrome: RoadmapChrome;
  canEdit: boolean;
  hrefs: Record<string, string>;
  onChanged?: () => void;
};

// 顶栏右侧操作区：导入（U5 纯 JSON 文件上传，红线：只收人工清单、绝不派生自 docs/*）
// 与选择项目（项目链接落到对应项目的首板）。
export function RoadmapToolbar({
  projects,
  currentProjectKey,
  locale,
  chrome,
  canEdit,
  hrefs,
  onChanged,
}: RoadmapToolbarProps) {
  const [open, setOpen] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

    try {
      const manifest: unknown = JSON.parse(await file.text());

      await roadmapRequest(roadmapEndpoints.import, 'POST', manifest);
      setImportStatus(chrome.importSucceeded ?? '');
      onChanged?.();
    } catch {
      setImportStatus(chrome.importFailed ?? '');
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
          {importStatus && (
            <span role="status" className="text-[0.75rem] text-[var(--color-text-muted)]">
              {importStatus}
            </span>
          )}
        </>
      )}

      <div ref={containerRef} className="relative">
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
      </div>
    </div>
  );
}
