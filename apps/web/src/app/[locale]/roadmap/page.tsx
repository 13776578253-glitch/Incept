import { getTranslations } from 'next-intl/server';

import type { RoadmapChrome } from '@incept/roadmap/react';
import { RoadmapBoard, RoadmapToolbar } from '@incept/roadmap/react';

import { WorkspaceShell } from '@/components/layouts/containers/workspace-shell';
import type { AppLocale } from '@/i18n/config/locales';
import { withLocalePath } from '@/i18n/utils/locale-path';
import { createRoadmapRepository, isRoadmapOwner } from '@/server/roadmap/assembly';
import { isAtlasBoardKey } from '@/server/roadmap/resolve-selection';
import { SurfaceNavigation } from '@/features/roadmap';

// 路线图与规划图页面：由 ?project= 选定项目，?surface= 选定表面（roadmap | atlas），兼容 ?rd= 参数。
// 列结构与显示名称由看板自身持有。非 Owner 用户隐藏全部写操作控件。
// history: 统一多项目表面路由与状态锁定，规划图表面固定使用 PLANNING eyebrow 与独立标题。
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
  const [roadmaps, projects, canEdit] = await Promise.all([
    repository.listRoadmaps(), repository.listProjects(), isRoadmapOwner(),
  ]);
  const currentProject = projects.find((candidate) => candidate.key === projectKey) ?? projects[0];

  const projectRoadmaps = currentProject
    ? roadmaps.filter((item) => item.project.key === currentProject.key)
    : [];

  const roadmapBoard = projectRoadmaps.find((item) => !isAtlasBoardKey(item.key)) ?? projectRoadmaps[0];
  const atlasBoard = projectRoadmaps.find((item) => isAtlasBoardKey(item.key));

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

  const hrefs: Record<string, string> = {};

  for (const project of projects) {
    hrefs[project.key] = withLocalePath(
      locale,
      `/roadmap?project=${encodeURIComponent(project.key)}&surface=${activeSurface}`,
    );
  }

  const roadmapHref = currentProject
    ? withLocalePath(locale, `/roadmap?project=${encodeURIComponent(currentProject.key)}&surface=roadmap`)
    : withLocalePath(locale, `/roadmap?surface=roadmap`);
  const atlasHref = currentProject
    ? withLocalePath(locale, `/roadmap?project=${encodeURIComponent(currentProject.key)}&surface=atlas`)
    : withLocalePath(locale, `/roadmap?surface=atlas`);

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
    importSuccessEyebrow: t('importFeedback.successEyebrow'),
    importSuccessTitle: t('importFeedback.successTitle'),
    importErrorEyebrow: t('importFeedback.errorEyebrow'),
    importErrorTitle: t('importFeedback.errorTitle'),
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
      <div className="mx-auto w-full max-w-[1480px] px-6 pt-6 pb-16 md:flex md:h-[calc(100dvh-var(--navbar-height,64px))] md:min-h-[560px] md:flex-col md:overflow-hidden md:pt-8 md:pb-16 lg:px-10 lg:pt-9 lg:pb-20">
        <h1 className="sr-only">
          {activeSurface === 'atlas' ? (current?.name[locale] ?? (locale === 'zh' ? '规划图' : 'Planning Board')) : t('page.title')}
        </h1>
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
            activeSurface={activeSurface}
            currentRoadmapKey={current.key}
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
