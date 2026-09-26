import { WorkspaceShell } from '@/components/layouts/containers/workspace-shell';
import { AtlasIndexFeature } from '@/features/atlas';
import { LockedSurface, SurfaceNavigation } from '@/features/atlas';
import type { AppLocale } from '@/i18n/config/locales';
import { createRoadmapRepository } from '@/server/roadmap/assembly';

// 图谱总览：列出本栏目下的全部图谱
export default async function AtlasPage({ params, searchParams }: { params: Promise<{ locale: AppLocale }>; searchParams: Promise<{ project?: string }> }) {
  const { locale } = await params;
  const { project: projectKey } = await searchParams;
  const repository = createRoadmapRepository();
  const projects = await repository.listProjects();
  const project = projects.find((candidate) => candidate.key === projectKey) ?? projects[0];
  return (
    <WorkspaceShell>
      {project ? <>
        <SurfaceNavigation projects={projects} currentProject={project} locale={locale} activeSurface="atlas" />
        {project.atlasEnabled ? <AtlasIndexFeature projectKey={project.key} /> : <LockedSurface locale={locale} surface="atlas" />}
      </> : <div className="mx-auto w-full max-w-[1120px] px-6 py-16 text-[var(--color-nav-dropdown-description)]">{locale === 'zh' ? '暂无可用项目。' : 'No projects are available.'}</div>}
    </WorkspaceShell>
  );
}
