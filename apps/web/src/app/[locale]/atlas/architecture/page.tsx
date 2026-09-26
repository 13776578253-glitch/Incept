import { WorkspaceShell } from '@/components/layouts/containers/workspace-shell';
import { AtlasPlaceholderScreen } from '@/features/atlas';
import type { AppLocale } from '@/i18n/config/locales';
import { getTranslations } from 'next-intl/server';
import { createRoadmapRepository } from '@/server/roadmap/assembly';
import { LockedSurface, SurfaceNavigation } from '@/features/atlas';

// 架构图：尚未绘制，本文件就是它完成后的接线位置
export default async function ArchitectureMapPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: AppLocale }>;
  searchParams: Promise<{ project?: string }>;
}) {
  const { locale } = await params;
  const { project: projectKey } = await searchParams;
  const t = await getTranslations({ locale, namespace: 'atlas' });
  const projects = await createRoadmapRepository().listProjects();
  const project = projects.find((candidate) => candidate.key === projectKey) ?? projects[0];

  return (
    <WorkspaceShell>
      {project ? <>
        <SurfaceNavigation projects={projects} currentProject={project} locale={locale} activeSurface="atlas" atlasPath="/atlas/architecture" />
        {project.atlasEnabled ? <AtlasPlaceholderScreen locale={locale} t={t} title={t('items.architecture.label')} projectKey={project.key} /> : <LockedSurface locale={locale} surface="atlas" />}
      </> : <div className="px-6 py-16">{locale === 'zh' ? '暂无可用项目。' : 'No projects are available.'}</div>}
    </WorkspaceShell>
  );
}
