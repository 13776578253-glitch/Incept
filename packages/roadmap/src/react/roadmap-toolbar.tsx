'use client';

import { useEffect, useRef, useState } from 'react';

import type { Roadmap, RoadmapLocale } from '../domain';

import { IconChevronDown, IconImport, IconProjectTag } from './icons';

type RoadmapToolbarProps = {
  roadmaps: readonly Roadmap[];
  currentKey: string;
  locale: RoadmapLocale;
  importLabel: string;
  projectSelectLabel: string;
  allProjectsLabel: string;
};

// 顶栏右侧操作区：与路线图/图谱板切换器处于同一水平基线，依次放置导入按钮与项目下拉选择标签（具体交互与后端能力待下一轮接入）。
export function RoadmapToolbar({
  roadmaps,
  currentKey,
  locale,
  importLabel,
  projectSelectLabel,
  allProjectsLabel,
}: RoadmapToolbarProps) {
  const [open, setOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<string>('all');
  const containerRef = useRef<HTMLDivElement>(null);

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
    selectedProject === 'all'
      ? projectSelectLabel
      : (roadmaps.find((item) => item.key === selectedProject)?.name[locale] ??
        roadmaps.find((item) => item.key === currentKey)?.name[locale] ??
        projectSelectLabel);

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <button
        type="button"
        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-3.5 py-1.5 text-[0.8rem] font-medium text-[var(--color-text)] shadow-[0_1px_2px_rgba(15,23,42,0.05)] transition-colors hover:border-[var(--color-text-soft)] hover:bg-[var(--roadmap-lane-bg)]"
      >
        <span aria-hidden="true" className="inline-flex shrink-0 text-[var(--color-text-muted)]">
          <IconImport />
        </span>
        {importLabel}
      </button>

      <div ref={containerRef} className="relative">
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((prev) => !prev)}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--roadmap-lane-bg)] px-3.5 py-1.5 text-[0.8rem] font-medium text-[var(--color-text)] transition-colors hover:border-[var(--color-text-soft)]"
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
            aria-label={projectSelectLabel}
            className="absolute right-0 z-20 mt-1.5 min-w-[168px] rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-1 shadow-[0_12px_32px_rgba(15,23,42,0.12)]"
          >
            <li role="option" aria-selected={selectedProject === 'all'} className="list-none">
              <button
                type="button"
                onClick={() => {
                  setSelectedProject('all');
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left text-[0.8rem] transition-colors ${
                  selectedProject === 'all'
                    ? 'bg-[var(--roadmap-chip-bg)] font-medium text-[var(--color-text)]'
                    : 'text-[var(--color-text-muted)] hover:bg-[var(--roadmap-lane-bg)] hover:text-[var(--color-text)]'
                }`}
              >
                <span>{allProjectsLabel}</span>
                {selectedProject === 'all' && (
                  <span
                    aria-hidden="true"
                    className="size-1.5 rounded-full bg-[var(--roadmap-status-active,#2563eb)]"
                  />
                )}
              </button>
            </li>
            {roadmaps.map((roadmap) => {
              const selected = selectedProject === roadmap.key;

              return (
                <li key={roadmap.key} role="option" aria-selected={selected} className="list-none">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedProject(roadmap.key);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left text-[0.8rem] transition-colors ${
                      selected
                        ? 'bg-[var(--roadmap-chip-bg)] font-medium text-[var(--color-text)]'
                        : 'text-[var(--color-text-muted)] hover:bg-[var(--roadmap-lane-bg)] hover:text-[var(--color-text)]'
                    }`}
                  >
                    <span>{roadmap.name[locale]}</span>
                    {selected && (
                      <span
                        aria-hidden="true"
                        className="size-1.5 rounded-full bg-[var(--roadmap-status-active,#2563eb)]"
                      />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
