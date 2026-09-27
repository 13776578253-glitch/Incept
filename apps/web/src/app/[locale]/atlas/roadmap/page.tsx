import { getTranslations } from 'next-intl/server';

import type { RoadmapChrome } from '@incept/roadmap/react';
import { RoadmapBoard, RoadmapToolbar } from '@incept/roadmap/react';

import { WorkspaceShell } from '@/components/layouts/containers/workspace-shell';
import type { AppLocale } from '@/i18n/config/locales';
import { withLocalePath } from '@/i18n/utils/locale-path';
import { createRoadmapRepository, isRoadmapOwner } from '@/server/roadmap/assembly';
import { SurfaceNavigation } from '@/features/atlas';

// 路线图页面：项目由 ?project= 选择，表面由 ?surface= 选择（roadmap | atlas），兼容 ?rd= 参数。
// T3 装配注入 Prisma 读链，列结构与显示名由每张 Roadmap 自带（T1 裁定）。
// U2：canEdit 由 isRoadmapOwner() 计算并下传，非 Owner 全部写控件隐藏（Module G）。
export default async function RoadmapMapPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: AppLocale }>;
  searchParams: Promise<{ rd?: string; project?: string; surface?: 'roadmap' | 'atlas' }>;
}) {
  const { locale } = await params;
  const { rd, project: projectKey, surface: requestedSurface } = await searchParams;
  const t = await getTranslations({ locale, namespace: 'roadmap' });

  const repository = createRoadmapRepository();
  const roadmaps = await repository.listRoadmaps();
  const projects = await repository.listProjects();
  const currentProject = projects.find((candidate) => candidate.key === projectKey) ?? projects[0];

  const projectRoadmaps = currentProject
    ? roadmaps.filter((item) => item.project.key === currentProject.key)
    : [];

  const roadmapBoard = projectRoadmaps.find((item) => !item.key.includes('atlas')) ?? projectRoadmaps[0];
  const atlasBoard = projectRoadmaps.find((item) => item.key.includes('atlas'));

  let activeSurface: 'roadmap' | 'atlas' = 'roadmap';

  if (requestedSurface === 'atlas' || (rd && atlasBoard && rd === atlasBoard.key)) {
    if (currentProject?.atlasEnabled) {
      activeSurface = 'atlas';
    } else {
      activeSurface = 'roadmap';
    }
  } else if (requestedSurface === 'roadmap' || (rd && roadmapBoard && rd === roadmapBoard.key)) {
    if (currentProject?.roadmapEnabled) {
      activeSurface = 'roadmap';
    } else {
      activeSurface = 'atlas';
    }
  } else {
    if (currentProject?.roadmapEnabled) {
      activeSurface = 'roadmap';
    } else if (currentProject?.atlasEnabled) {
      activeSurface = 'atlas';
    } else {
      activeSurface = 'roadmap';
    }
  }

  const current = (activeSurface === 'atlas' ? atlasBoard : roadmapBoard) ?? roadmapBoard ?? projectRoadmaps[0];

  const board = current ? await repository.listBoard(current.key) : null;

  const canEdit = await isRoadmapOwner();
  const hrefs: Record<string, string> = {};

  for (const project of projects) {
    hrefs[project.key] = withLocalePath(
      locale,
      `/atlas/roadmap?project=${encodeURIComponent(project.key)}&surface=${activeSurface}`,
    );
  }

  const roadmapHref = currentProject
    ? withLocalePath(locale, `/atlas/roadmap?project=${encodeURIComponent(currentProject.key)}&surface=roadmap`)
    : withLocalePath(locale, `/atlas/roadmap?surface=roadmap`);
  const atlasHref = currentProject
    ? withLocalePath(locale, `/atlas/roadmap?project=${encodeURIComponent(currentProject.key)}&surface=atlas`)
    : withLocalePath(locale, `/atlas/roadmap?surface=atlas`);

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

  if (!currentProject.roadmapEnabled && !currentProject.atlasEnabled) {
    return (
      <WorkspaceShell>
        <SurfaceNavigation projects={projects} currentProject={currentProject} locale={locale} activeSurface={activeSurface} roadmapHref={roadmapHref} atlasHref={atlasHref} showProjectSelector={false} />
        <div className="mx-auto w-full max-w-[1480px] px-6 py-12 lg:px-10"><p className="text-[0.9rem] text-[var(--color-text-soft)]">{t('emptyState')}</p></div>
      </WorkspaceShell>
    );
  }

  if (!current || !board) {
    return (
      <WorkspaceShell>
        <SurfaceNavigation projects={projects} currentProject={currentProject} locale={locale} activeSurface={activeSurface} roadmapHref={roadmapHref} atlasHref={atlasHref} showProjectSelector={false} />
        <div className="mx-auto w-full max-w-[1480px] px-6 py-12 lg:px-10"><p className="text-[0.9rem] text-[var(--color-text-soft)]">{t('emptyState')}</p></div>
      </WorkspaceShell>
    );
  }

  return (
    <WorkspaceShell>
      <div className="mx-auto w-full max-w-[1480px] px-6 pt-6 pb-16 md:flex md:h-[calc(100dvh-var(--navbar-height,64px))] md:min-h-[560px] md:flex-col md:overflow-hidden md:pt-8 md:pb-6 lg:px-10 lg:pt-9">
        <header className="shrink-0 pb-6 md:pb-7">
          <div className="max-w-[46rem] space-y-2 md:space-y-2.5">
            <p className="text-[0.72rem] font-medium uppercase tracking-[0.16em] text-[var(--color-nav-muted)]">
              {activeSurface === 'atlas' ? (locale === 'zh' ? 'Atlas' : 'Atlas') : t('page.eyebrow')}
            </p>
            <h1 className="max-w-[44rem] text-[2rem] font-semibold tracking-[-0.05em] text-[var(--color-text)] md:text-[2.45rem] md:leading-[1.08]">
              {activeSurface === 'atlas' ? (current?.name[locale] ?? (locale === 'zh' ? '图谱' : 'Atlas')) : t('page.title')}
            </h1>
          </div>
        </header>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 shrink-0 md:mb-5">
          <SurfaceNavigation
            projects={projects}
            currentProject={currentProject}
            locale={locale}
            activeSurface={activeSurface}
            roadmapHref={roadmapHref}
            atlasHref={atlasHref}
            showProjectSelector={false}
          />
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
