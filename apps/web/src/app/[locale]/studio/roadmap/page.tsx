import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import type { RoadmapAdminChrome } from '@incept/roadmap/react';
import { RoadmapAdminPanel } from '@incept/roadmap/react';
import { ROADMAP_STATUSES } from '@incept/roadmap/domain';

import type { AppLocale } from '@/i18n/config/locales';
import { getCurrentViewer } from '@/server/auth';
import { loadRoadmapAdminBoards, loadRoadmapAdminProjects } from '@/server/roadmap/assembly';

// studio/roadmap：owner 门控的写入面（internal-surfaces 绑定：不进 atlas 子树、不进前台导航）。
export default async function StudioRoadmapPage({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}) {
  const { locale } = await params;

  if ((await getCurrentViewer()).role !== 'owner') {
    return notFound();
  }

  const t = await getTranslations({ locale, namespace: 'roadmap' });
  const boards = await loadRoadmapAdminBoards();
  const projects = await loadRoadmapAdminProjects();

  const chrome: RoadmapAdminChrome = {
    heading: t('admin.heading'),
    boardsLabel: t('admin.boardsLabel'),
    projectsLabel: t('admin.projectsLabel'),
    columnsLabel: t('admin.columnsLabel'),
    entriesLabel: t('admin.entriesLabel'),
    emptySelection: t('admin.emptySelection'),
    emptyProjectSelection: t('admin.emptyProjectSelection'),
    projectKey: t('admin.projectKey'),
    projectNameEn: t('admin.projectNameEn'),
    projectNameZh: t('admin.projectNameZh'),
    projectDeleteBlocked: t('admin.projectDeleteBlocked'),
    fieldKey: t('admin.fieldKey'),
    nameEn: t('admin.nameEn'),
    nameZh: t('admin.nameZh'),
    titleEn: t('admin.titleEn'),
    titleZh: t('admin.titleZh'),
    summaryEn: t('admin.summaryEn'),
    summaryZh: t('admin.summaryZh'),
    labelEn: t('admin.labelEn'),
    labelZh: t('admin.labelZh'),
    fieldStatus: t('admin.fieldStatus'),
    fieldType: t('admin.fieldType'),
    fieldPriority: t('admin.fieldPriority'),
    fieldOrder: t('admin.fieldOrder'),
    fieldHref: t('admin.fieldHref'),
    addLink: t('admin.addLink'),
    removeLink: t('admin.removeLink'),
    create: t('admin.create'),
    update: t('admin.update'),
    deleteLabel: t('admin.deleteLabel'),
    confirmDelete: t('admin.confirmDelete'),
    failed: t('admin.failed'),
    statusLabels: Object.fromEntries(
      ROADMAP_STATUSES.map((status) => [status, t(`admin.status.${status}`)]),
    ) as RoadmapAdminChrome['statusLabels'],
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
  };

  return <RoadmapAdminPanel boards={boards} projects={projects} chrome={chrome} />;
}
