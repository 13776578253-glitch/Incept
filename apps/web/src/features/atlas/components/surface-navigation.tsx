'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { RoadmapProject } from '@incept/roadmap/domain';
import { IconChevronDown, IconProjectTag } from '@incept/roadmap/react';
import type { AppLocale } from '@/i18n/config/locales';
import { withLocalePath } from '@/i18n/utils/locale-path';

export function SurfaceNavigation({
  projects,
  currentProject,
  locale,
  activeSurface,
  roadmapHref: customRoadmapHref,
  atlasHref: customAtlasHref,
  atlasPath = '/atlas',
  showProjectSelector = true,
}: {
  projects: readonly RoadmapProject[];
  currentProject: RoadmapProject;
  locale: AppLocale;
  activeSurface: 'atlas' | 'roadmap';
  roadmapHref?: string;
  atlasHref?: string;
  atlasPath?: string;
  showProjectSelector?: boolean;
}) {
  const roadmapEnabled = currentProject.roadmapEnabled;
  const atlasEnabled = currentProject.atlasEnabled;
  const projectQuery = `project=${encodeURIComponent(currentProject.key)}`;
  const roadmapHref = customRoadmapHref ?? `${withLocalePath(locale, '/atlas/roadmap')}?${projectQuery}&surface=roadmap`;
  const atlasHref = customAtlasHref ?? `${withLocalePath(locale, '/atlas/roadmap')}?${projectQuery}&surface=atlas`;
  const tabClass = 'inline-flex items-center rounded-full px-3.5 py-1 text-[0.8rem] font-medium transition-all';

  return (
    <div className={showProjectSelector ? 'mx-auto flex w-full max-w-[1480px] flex-wrap items-center justify-between gap-4 px-6 pt-7 lg:px-10' : 'inline-flex items-center'}>
      {showProjectSelector ? <ProjectSelector projects={projects} currentProject={currentProject} locale={locale} pathname="/atlas/roadmap" activeSurface={activeSurface} label={locale === 'zh' ? '选择项目' : 'Select project'} /> : null}
      <nav aria-label={locale === 'zh' ? '项目功能' : 'Project surfaces'} className="inline-flex flex-wrap items-center gap-1 rounded-full border border-[var(--roadmap-border,var(--color-border))] bg-[var(--roadmap-lane-bg)] p-1">
        {roadmapEnabled ? (
          <Link
            href={roadmapHref}
            aria-current={activeSurface === 'roadmap' ? 'page' : undefined}
            className={`${tabClass} ${activeSurface === 'roadmap' ? 'border border-[var(--roadmap-border,var(--color-border))] bg-[var(--roadmap-card-bg,var(--color-bg))] text-[var(--color-text)] shadow-[0_1px_2px_rgba(15,23,42,0.06)]' : 'border border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`}
          >
            {locale === 'zh' ? '路线图' : 'Roadmap'}
          </Link>
        ) : (
          <button
            type="button"
            disabled
            aria-disabled="true"
            className={`${tabClass} cursor-not-allowed border border-transparent text-[var(--color-text-muted)] opacity-65`}
          >
            <span aria-hidden="true">🔒</span>{locale === 'zh' ? '路线图' : 'Roadmap'}
          </button>
        )}
        {atlasEnabled ? (
          <Link
            href={atlasHref}
            aria-current={activeSurface === 'atlas' ? 'page' : undefined}
            className={`${tabClass} ${activeSurface === 'atlas' ? 'border border-[var(--roadmap-border,var(--color-border))] bg-[var(--roadmap-card-bg,var(--color-bg))] text-[var(--color-text)] shadow-[0_1px_2px_rgba(15,23,42,0.06)]' : 'border border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`}
          >
            {locale === 'zh' ? '图谱' : 'Atlas'}
          </Link>
        ) : (
          <button
            type="button"
            disabled
            aria-disabled="true"
            className={`${tabClass} cursor-not-allowed border border-transparent text-[var(--color-text-muted)] opacity-65`}
          >
            <span aria-hidden="true">🔒</span>{locale === 'zh' ? '图谱' : 'Atlas'}
          </button>
        )}
      </nav>
    </div>
  );
}

function ProjectSelector({
  projects,
  currentProject,
  locale,
  pathname,
  label,
  activeSurface,
}: {
  projects: readonly RoadmapProject[];
  currentProject: RoadmapProject;
  locale: AppLocale;
  pathname: string;
  label: string;
  activeSurface?: 'atlas' | 'roadmap';
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function closeOnOutside(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const currentName = currentProject.name[locale];

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--roadmap-border,var(--color-border))] bg-[var(--roadmap-card-bg,var(--roadmap-lane-bg))] px-3.5 py-1.5 text-[0.8rem] font-medium text-[var(--color-text)] shadow-[0_1px_2px_rgba(15,23,42,0.05)] transition-colors hover:border-[var(--roadmap-border-hover,var(--color-text-soft))] hover:bg-[var(--roadmap-card-hover-bg,var(--roadmap-lane-bg))]"
      >
        <span aria-hidden="true" className="inline-flex shrink-0 text-[var(--roadmap-status-active,#2563eb)]"><IconProjectTag /></span>
        <span>{currentName}</span>
        <span aria-hidden="true" className={`inline-flex shrink-0 text-[var(--color-text-soft)] transition-transform duration-150 ${open ? 'rotate-180' : ''}`}><IconChevronDown /></span>
      </button>
      {open ? (
        <ul role="listbox" aria-label={label} className="absolute right-0 z-20 mt-1.5 min-w-[168px] rounded-[10px] border border-[var(--roadmap-border,var(--color-border))] bg-[var(--roadmap-popover-bg,var(--color-bg))] p-1 shadow-[0_12px_32px_rgba(0,0,0,0.22)]">
          {projects.map((project) => {
            const selected = project.key === currentProject.key;
            const surfaceQuery = activeSurface ? `&surface=${activeSurface}` : '';
            const href = `${withLocalePath(locale, pathname)}?project=${encodeURIComponent(project.key)}${surfaceQuery}`;
            return (
              <li key={project.key} role="option" aria-selected={selected} className="list-none">
                <Link href={href} onClick={() => setOpen(false)} className={`flex w-full items-center justify-between rounded-[6px] px-3 py-1.5 text-left text-[0.8rem] transition-colors ${selected ? 'bg-[var(--roadmap-chip-bg)] font-medium text-[var(--color-text)]' : 'text-[var(--color-text-muted)] hover:bg-[var(--roadmap-chip-bg)] hover:text-[var(--color-text)]'}`}>
                  <span>{project.name[locale]}</span>
                  {selected ? <span aria-hidden="true" className="size-1.5 rounded-full bg-[var(--roadmap-status-active,#2563eb)]" /> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

export function LockedSurface({ locale, surface }: { locale: AppLocale; surface: 'atlas' | 'roadmap' }) {
  const label = surface === 'atlas' ? (locale === 'zh' ? '图谱' : 'Atlas') : (locale === 'zh' ? '路线图' : 'Roadmap');
  return (
    <div className="mx-auto w-full max-w-[1480px] px-6 py-12 lg:px-10">
      <section role="status" className="max-w-2xl rounded-2xl border border-[var(--color-nav-dropdown-border)] bg-[var(--color-nav-dropdown-bg)] p-6">
        <p className="text-[0.72rem] font-medium uppercase tracking-[0.16em] text-[var(--color-nav-muted)]">{locale === 'zh' ? '功能已锁定' : 'Surface locked'}</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-[var(--color-text)]">{locale === 'zh' ? `${label}当前未启用` : `${label} is currently disabled`}</h1>
        <p className="mt-2 text-[0.9rem] leading-7 text-[var(--color-nav-dropdown-description)]">{locale === 'zh' ? '此项目已在设置中关闭该功能。请切换到已启用的功能，或由管理员在设置中重新开启。' : 'This surface is disabled for this project. Switch to an enabled surface, or ask an administrator to enable it in Settings.'}</p>
      </section>
    </div>
  );
}
