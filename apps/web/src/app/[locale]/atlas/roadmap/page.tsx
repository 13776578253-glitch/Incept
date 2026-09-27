import { getTranslations } from 'next-intl/server';

import type { RoadmapChrome } from '@incept/roadmap/react';
import { RoadmapBoard, RoadmapSwitcher, RoadmapToolbar } from '@incept/roadmap/react';

import { WorkspaceShell } from '@/components/layouts/containers/workspace-shell';
import type { AppLocale } from '@/i18n/config/locales';
import { withLocalePath } from '@/i18n/utils/locale-path';
import { createRoadmapRepository, isRoadmapOwner } from '@/server/roadmap/assembly';
import { resolveRoadmapSelection } from '@/server/roadmap/resolve-selection';
import { LockedSurface, SurfaceNavigation } from '@/features/atlas';

// 路线图页面：项目由 ?project= 选择，项目内板由 ?rd= 选择；合法 rd 优先。
// T3 装配注入 Prisma 读链，列结构与显示名由每张 Roadmap 自带（T1 裁定）。
// U2：canEdit 由 isRoadmapOwner() 计算并下传，非 Owner 全部写控件隐藏（Module G）。
export default async function RoadmapMapPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: AppLocale }>;
  searchParams: Promise<{ rd?: string; project?: string }>;
}) {
  const { locale } = await params;
  const { rd, project: projectKey } = await searchParams;
  const t = await getTranslations({ locale, namespace: 'roadmap' });

  const repository = createRoadmapRepository();
  const roadmaps = await repository.listRoadmaps();
  const projects = await repository.listProjects();
  const selection = resolveRoadmapSelection(projects, roadmaps, projectKey, rd);
  const current = selection?.roadmap;
  const currentProject = selection?.project ?? projects.find((candidate) => candidate.key === projectKey) ?? projects[0];
  const currentProjectRoadmaps = currentProject
    ? roadmaps.filter((roadmap) => roadmap.project.key === currentProject.key)
    : [];
  const board = current ? await repository.listBoard(current.key) : null;

  const canEdit = await isRoadmapOwner();
  const hrefs: Record<string, string> = {};

  for (const project of projects) {
    hrefs[project.key] = withLocalePath(
      locale,
      `/atlas/roadmap?project=${encodeURIComponent(project.key)}`,
    );
  }

  const chrome: RoadmapChrome = {
    switcherLabel: t('switcherLabel'),
    boardLabel: t('boardLabel'),
    lanePickerLabel: t('lanePickerLabel'),
    emptyLane: {
      reviewing: t('emptyLane.reviewing'),
      unstarted: t('emptyLane.unstarted'),
      active: t('emptyLane.active'),
      completed: t('emptyLane.completed'),
      canceled: t('emptyLane.canceled'),
    },
    loadMore: t('loadMore'),
    errorTitle: t('error.title'),
    errorDescription: t('error.description'),
    typeLabels: {
      feature: t('chips.type.feature'),
      improvement: t('chips.type.improvement'),
      maintenance: t('chips.type.maintenance'),
    },
    priorityLabels: {
      high: t('chips.priority.high'),
      middle: t('chips.priority.middle'),
      low: t('chips.priority.low'),
      none: t('chips.priority.none'),
    },
    confirmDelete: t('modal.confirmDelete'),
    saveFailed: t('modal.saveFailed'),
    importSucceeded: t('importSucceeded'),
    importFailed: t('importFailed'),
    lastUpdated: t('modal.lastUpdated'),
    createdLabel: t('modal.createdLabel'),
    pendingDetail: t('modal.pendingDetail'),
    importLabel: t('importLabel'),
    projectSelectLabel: t('projectSelectLabel'),
  };

  if (!currentProject) {
    return (
      <WorkspaceShell>
        <div className="mx-auto w-full max-w-[1480px] px-6 py-16 lg:px-10"><p className="text-[0.9rem] text-[var(--color-text-soft)]">{t('emptyState')}</p></div>
      </WorkspaceShell>
    );
  }

  if (!currentProject.roadmapEnabled) {
    return <WorkspaceShell><SurfaceNavigation projects={projects} currentProject={currentProject} locale={locale} activeSurface="roadmap" /><LockedSurface locale={locale} surface="roadmap" /></WorkspaceShell>;
  }

  if (!current || !board) {
    return <WorkspaceShell><SurfaceNavigation projects={projects} currentProject={currentProject} locale={locale} activeSurface="roadmap" /><div className="mx-auto w-full max-w-[1480px] px-6 py-12 lg:px-10"><p className="text-[0.9rem] text-[var(--color-text-soft)]">{t('emptyState')}</p></div></WorkspaceShell>;
  }

  return (
    <WorkspaceShell>
      <div className="mx-auto w-full max-w-[1480px] px-6 pt-8 pb-16 md:flex md:h-[calc(100dvh-var(--navbar-height,64px))] md:min-h-[560px] md:flex-col md:overflow-hidden md:pt-10 md:pb-6 lg:px-10">
        <header className="pb-8 md:shrink-0 md:pb-5">
          <div className="max-w-[46rem] space-y-2.5 md:space-y-3">
            <p className="text-[0.72rem] font-medium uppercase tracking-[0.16em] text-[var(--color-nav-muted)]">
              {t('page.eyebrow')}
            </p>
            <h1 className="max-w-[44rem] text-[2rem] font-semibold tracking-[-0.05em] text-[var(--color-text)] md:text-[2.45rem] md:leading-[1.08]">
              {t('page.title')}
            </h1>
          </div>
        </header>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 md:shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <RoadmapSwitcher
              roadmaps={currentProjectRoadmaps}
              currentKey={current.key}
              locale={locale}
              hrefFor={(key) => withLocalePath(locale, `/atlas/roadmap?project=${encodeURIComponent(currentProject.key)}&rd=${encodeURIComponent(key)}`)}
              label={chrome.switcherLabel}
            />
            <SurfaceNavigation projects={projects} currentProject={currentProject} locale={locale} activeSurface="roadmap" showProjectSelector={false} />
          </div>
          <RoadmapToolbar
            projects={projects}
            currentProjectKey={currentProject.key}
            locale={locale}
            chrome={chrome}
            canEdit={canEdit}
            hrefs={hrefs}
          />
        </div>
        <RoadmapBoard
          key={current.key}
          board={board}
          locale={locale}
          chrome={chrome}
          canEdit={canEdit}
        />
      </div>
    </WorkspaceShell>
  );
}
