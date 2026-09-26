import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import type { RoadmapChrome } from '@incept/roadmap/react';
import { RoadmapBoard, RoadmapSwitcher, RoadmapToolbar } from '@incept/roadmap/react';

import { WorkspaceShell } from '@/components/layouts/containers/workspace-shell';
import type { AppLocale } from '@/i18n/config/locales';
import { withLocalePath } from '@/i18n/utils/locale-path';
import { createRoadmapRepository, isRoadmapOwner } from '@/server/roadmap/assembly';

// 路线图 Phase 2：Prisma 读链（T3 装配注入，数据 = pnpm roadmap:seed 的初始入库内容）。
// 多 roadmap 切换走 ?rd=（T2 裁定），列结构与显示名由每张 roadmap 自带（T1 裁定）。
// U2：canEdit 由 isRoadmapOwner() 计算并下传，非 Owner 全部写控件隐藏（Module G）。
export default async function RoadmapMapPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: AppLocale }>;
  searchParams: Promise<{ rd?: string }>;
}) {
  const { locale } = await params;
  const { rd } = await searchParams;
  const t = await getTranslations({ locale, namespace: 'roadmap' });

  const repository = createRoadmapRepository();
  const roadmaps = await repository.listRoadmaps();
  const current = roadmaps.find((roadmap) => roadmap.key === rd) ?? roadmaps[0];
  const board = current ? await repository.listBoard(current.key) : null;

  if (!current || !board) {
    return notFound();
  }

  const canEdit = await isRoadmapOwner();
  const hrefs: Record<string, string> = {};

  for (const roadmap of roadmaps) {
    hrefs[roadmap.key] = withLocalePath(
      locale,
      `/atlas/roadmap?rd=${encodeURIComponent(roadmap.key)}`,
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

  return (
    <WorkspaceShell>
      <div className="mx-auto w-full max-w-[1480px] px-6 pt-6 pb-16 md:flex md:h-[calc(100dvh-var(--navbar-height,64px))] md:min-h-[560px] md:flex-col md:overflow-hidden md:pt-7 md:pb-6 lg:px-10">
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
          <RoadmapSwitcher
            roadmaps={roadmaps}
            currentKey={current.key}
            locale={locale}
            hrefFor={(key) => withLocalePath(locale, `/atlas/roadmap?rd=${encodeURIComponent(key)}`)}
            label={chrome.switcherLabel}
          />
          <RoadmapToolbar
            roadmaps={roadmaps}
            currentKey={current.key}
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
