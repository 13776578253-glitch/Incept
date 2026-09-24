import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import type { RoadmapChrome } from '@incept/roadmap/react';
import { RoadmapBoard, RoadmapSwitcher } from '@incept/roadmap/react';

import { WorkspaceShell } from '@/components/layouts/containers/workspace-shell';
import type { AppLocale } from '@/i18n/config/locales';
import { withLocalePath } from '@/i18n/utils/locale-path';
import { createRoadmapRepository } from '@/server/roadmap/assembly';

// 路线图 Phase 2：Prisma 读链（T3 装配注入，数据 = pnpm roadmap:seed 的初始入库内容）。
// 多 roadmap 切换走 ?rd=（T2 裁定），列结构与显示名由每张 roadmap 自带（T1 裁定）。
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
    loading: t('loading'),
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
    votesLabel: t('metrics.votes', { count: '{count}' }),
    commentsLabel: t('metrics.comments', { count: '{count}' }),
  };

  return (
    <WorkspaceShell>
      <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-6 px-6 pt-10 pb-16 lg:px-10">
        <header className="max-w-[720px] space-y-4">
          <p className="text-[0.76rem] uppercase tracking-[0.2em] text-[var(--color-text-soft)]">
            {t('page.eyebrow')}
          </p>
          <h1 className="text-[clamp(2.4rem,5vw,4.6rem)] font-semibold leading-[1.02] tracking-[-0.04em] text-[var(--color-text)]">
            {t('page.title')}
          </h1>
          <p className="text-[1.02rem] leading-8 text-[var(--color-text-muted)]">
            {t('page.description')}
          </p>
        </header>
        <RoadmapSwitcher
          roadmaps={roadmaps}
          currentKey={current.key}
          locale={locale}
          hrefFor={(key) => withLocalePath(locale, `/atlas/roadmap?rd=${encodeURIComponent(key)}`)}
          label={chrome.switcherLabel}
        />
        <RoadmapBoard board={board} locale={locale} chrome={chrome} />
      </div>
    </WorkspaceShell>
  );
}
