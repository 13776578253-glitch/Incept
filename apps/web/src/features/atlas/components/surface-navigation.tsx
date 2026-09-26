'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { RoadmapProject } from '@incept/roadmap/domain';
import type { AppLocale } from '@/i18n/config/locales';
import { withLocalePath } from '@/i18n/utils/locale-path';

export function SurfaceNavigation({
  projects,
  currentProject,
  locale,
  activeSurface,
  atlasPath = '/atlas',
  showProjectSelector = true,
}: {
  projects: readonly RoadmapProject[];
  currentProject: RoadmapProject;
  locale: AppLocale;
  activeSurface: 'atlas' | 'roadmap';
  atlasPath?: string;
  showProjectSelector?: boolean;
}) {
  const router = useRouter();
  const roadmapEnabled = currentProject.roadmapEnabled;
  const atlasEnabled = currentProject.atlasEnabled;
  const projectQuery = `project=${encodeURIComponent(currentProject.key)}`;
  const atlasHref = `${withLocalePath(locale, atlasPath)}?${projectQuery}${atlasEnabled ? '' : '&locked=atlas'}`;
  const roadmapHref = `${withLocalePath(locale, '/atlas/roadmap')}?${projectQuery}${roadmapEnabled ? '' : '&locked=roadmap'}`;
  const tabClass = 'inline-flex min-h-10 items-center gap-2 rounded-full border px-4 text-[0.8125rem] font-medium transition-colors';

  return (
    <div className="mx-auto flex w-full max-w-[1480px] flex-wrap items-center justify-between gap-3 px-6 pt-6 lg:px-10">
      {showProjectSelector && <label className="flex items-center gap-2 text-[0.78rem] text-[var(--color-nav-dropdown-description)]">
        <span>{locale === 'zh' ? '项目' : 'Project'}</span>
        <select value={currentProject.key} aria-label={locale === 'zh' ? '选择项目' : 'Select project'} onChange={(event) => router.push(`${withLocalePath(locale, activeSurface === 'roadmap' ? '/atlas/roadmap' : atlasPath)}?project=${encodeURIComponent(event.target.value)}`)} className="min-h-10 max-w-[min(62vw,260px)] rounded-full border border-[var(--color-nav-dropdown-border)] bg-[var(--color-nav-dropdown-bg)] px-3 text-[0.8125rem] font-medium text-[var(--color-text)]">
          {projects.map((project) => <option key={project.key} value={project.key}>{project.name[locale]}</option>)}
        </select>
      </label>}
      <nav aria-label={locale === 'zh' ? '项目功能' : 'Project surfaces'} className="flex flex-wrap items-center gap-2">
        <Link href={roadmapHref} aria-current={activeSurface === 'roadmap' ? 'page' : undefined} aria-disabled={!roadmapEnabled} className={`${tabClass} ${activeSurface === 'roadmap' ? 'border-[var(--color-text)] bg-[var(--color-text)] text-[var(--color-bg)]' : 'border-[var(--color-nav-dropdown-border)] text-[var(--color-text)] hover:bg-[var(--color-nav-item-hover)]'} ${!roadmapEnabled ? 'opacity-65' : ''}`}>
          {!roadmapEnabled && <span aria-hidden="true">🔒</span>}{locale === 'zh' ? '路线图' : 'Roadmap'}
        </Link>
        <Link href={atlasHref} aria-current={activeSurface === 'atlas' ? 'page' : undefined} aria-disabled={!atlasEnabled} className={`${tabClass} ${activeSurface === 'atlas' ? 'border-[var(--color-text)] bg-[var(--color-text)] text-[var(--color-bg)]' : 'border-[var(--color-nav-dropdown-border)] text-[var(--color-text)] hover:bg-[var(--color-nav-item-hover)]'} ${!atlasEnabled ? 'opacity-65' : ''}`}>
          {!atlasEnabled && <span aria-hidden="true">🔒</span>}{locale === 'zh' ? '图谱' : 'Atlas'}
        </Link>
      </nav>
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
