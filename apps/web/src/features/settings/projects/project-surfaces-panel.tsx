'use client';

import { useState } from 'react';

type Project = {
  key: string;
  name: { en: string; zh: string };
  roadmapEnabled: boolean;
  atlasEnabled: boolean;
};

export function ProjectSurfacesPanel({
  initialProjects,
  language,
}: {
  initialProjects: Project[];
  language: 'en' | 'zh';
}) {
  const [projects, setProjects] = useState(initialProjects);
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [newProject, setNewProject] = useState({ key: '', en: '', zh: '' });
  const isZh = language === 'zh';

  async function save(project: Project) {
    if (!project.roadmapEnabled && !project.atlasEnabled) {
      setMessage(isZh ? '至少保留路线图或图谱中的一项。' : 'Keep at least one surface enabled.');
      return;
    }
    setPending(project.key);
    setMessage('');
    try {
      const response = await fetch(`/api/internal/roadmap/projects/${encodeURIComponent(project.key)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: project.name, roadmapEnabled: project.roadmapEnabled, atlasEnabled: project.atlasEnabled }),
      });
      if (!response.ok) throw new Error();
      setMessage(isZh ? '已保存项目设置。' : 'Project settings saved.');
    } catch {
      setMessage(isZh ? '保存失败，请重试。' : 'Could not save. Please try again.');
    } finally {
      setPending(null);
    }
  }

  async function remove(project: Project) {
    setPending(`delete:${project.key}`);
    setMessage('');
    try {
      const response = await fetch(`/api/internal/roadmap/projects/${encodeURIComponent(project.key)}`, { method: 'DELETE' });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error);
      setProjects((current) => current.filter((item) => item.key !== project.key));
      setMessage(isZh ? '项目已删除。' : 'Project deleted.');
    } catch (error) {
      setMessage(error instanceof Error && error.message ? error.message : (isZh ? '删除失败，请确认项目没有看板。' : 'Could not delete. Make sure the project has no boards.'));
    } finally {
      setPending(null);
    }
  }

  function update(key: string, change: Partial<Project>) {
    setProjects((current) => current.map((project) => project.key === key ? { ...project, ...change } : project));
  }

  async function createProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending('new');
    setMessage('');
    try {
      const response = await fetch('/api/internal/roadmap/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: newProject.key, name: { en: newProject.en, zh: newProject.zh } }),
      });
      const payload = await response.json() as { project?: Project; error?: string };
      if (!response.ok || !payload.project) throw new Error(payload.error);
      setProjects((current) => [...current, payload.project!]);
      setNewProject({ key: '', en: '', zh: '' });
      setMessage(isZh ? '项目已创建。' : 'Project created.');
    } catch (error) {
      setMessage(error instanceof Error && error.message ? error.message : (isZh ? '创建失败，请重试。' : 'Could not create the project.'));
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="max-w-[760px] space-y-6">
      <header className="space-y-1.5">
        <h2 className="text-[1.18rem] font-semibold tracking-[-0.03em] text-[var(--color-text)]">{isZh ? '项目与功能' : 'Projects & surfaces'}</h2>
        <p className="text-[0.8125rem] leading-6 text-[var(--color-nav-dropdown-description)]">
          {isZh ? '每个项目可分别启用路线图和图谱。两种入口始终显示；关闭的功能会以锁定状态呈现。' : 'Enable Roadmap and Atlas per project. Both entry points stay visible, with disabled surfaces shown as locked.'}
        </p>
      </header>
      <form onSubmit={(event) => void createProject(event)} className="grid gap-3 rounded-2xl border border-[var(--color-nav-dropdown-border)] p-4 sm:grid-cols-2">
        <label className="space-y-1 text-[0.78rem] text-[var(--color-nav-dropdown-description)] sm:col-span-2">{isZh ? '项目标识' : 'Project key'}
          <input required pattern="[a-z0-9][a-z0-9-]*" value={newProject.key} onChange={(event) => setNewProject({ ...newProject, key: event.target.value })} placeholder="my-project" className="min-h-10 w-full rounded-[10px] border border-[var(--color-nav-dropdown-border)] bg-[var(--color-nav-dropdown-bg)] px-3 text-[0.875rem] text-[var(--color-text)]" />
        </label>
        <label className="space-y-1 text-[0.78rem] text-[var(--color-nav-dropdown-description)]">{isZh ? '中文名称' : 'Chinese name'}
          <input required value={newProject.zh} onChange={(event) => setNewProject({ ...newProject, zh: event.target.value })} className="min-h-10 w-full rounded-[10px] border border-[var(--color-nav-dropdown-border)] bg-[var(--color-nav-dropdown-bg)] px-3 text-[0.875rem] text-[var(--color-text)]" />
        </label>
        <label className="space-y-1 text-[0.78rem] text-[var(--color-nav-dropdown-description)]">{isZh ? '英文名称' : 'English name'}
          <input required value={newProject.en} onChange={(event) => setNewProject({ ...newProject, en: event.target.value })} className="min-h-10 w-full rounded-[10px] border border-[var(--color-nav-dropdown-border)] bg-[var(--color-nav-dropdown-bg)] px-3 text-[0.875rem] text-[var(--color-text)]" />
        </label>
        <div className="flex items-center justify-between gap-3 sm:col-span-2">
          <span className="text-[0.78rem] text-[var(--color-nav-muted)]">{isZh ? '新项目默认启用路线图和图谱。' : 'New projects start with both surfaces enabled.'}</span>
          <button type="submit" disabled={pending === 'new'} className="rounded-full border border-[var(--color-nav-dropdown-border)] px-4 py-2 text-[0.8125rem] font-medium text-[var(--color-text)] hover:bg-[var(--color-nav-item-hover)] disabled:opacity-50">{isZh ? '创建项目' : 'Create project'}</button>
        </div>
      </form>
      <div className="divide-y divide-[var(--color-nav-dropdown-border)]">
        {projects.map((project) => (
          <article key={project.key} className="space-y-4 py-5 first:pt-0">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-[0.78rem] text-[var(--color-nav-dropdown-description)]">
                {isZh ? '中文名称' : 'Chinese name'}
                <input value={project.name.zh} onChange={(event) => update(project.key, { name: { ...project.name, zh: event.target.value } })} className="min-h-10 w-full rounded-[10px] border border-[var(--color-nav-dropdown-border)] bg-[var(--color-nav-dropdown-bg)] px-3 text-[0.875rem] text-[var(--color-text)]" />
              </label>
              <label className="space-y-1 text-[0.78rem] text-[var(--color-nav-dropdown-description)]">
                {isZh ? '英文名称' : 'English name'}
                <input value={project.name.en} onChange={(event) => update(project.key, { name: { ...project.name, en: event.target.value } })} className="min-h-10 w-full rounded-[10px] border border-[var(--color-nav-dropdown-border)] bg-[var(--color-nav-dropdown-bg)] px-3 text-[0.875rem] text-[var(--color-text)]" />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              {(['roadmapEnabled', 'atlasEnabled'] as const).map((field) => {
                const enabled = project[field];
                const wouldDisableLast = enabled && (field === 'roadmapEnabled' ? !project.atlasEnabled : !project.roadmapEnabled);
                const label = field === 'roadmapEnabled' ? (isZh ? '路线图' : 'Roadmap') : (isZh ? '图谱' : 'Atlas');
                return (
                  <label key={field} className="inline-flex items-center gap-2 text-[0.875rem] text-[var(--color-text)]">
                    <input type="checkbox" checked={enabled} disabled={wouldDisableLast} onChange={(event) => update(project.key, { [field]: event.target.checked })} className="size-4 accent-[var(--color-text)]" />
                    {label}
                  </label>
                );
              })}
              <button type="button" disabled={pending === project.key} onClick={() => void save(project)} className="rounded-full border border-[var(--color-nav-dropdown-border)] px-4 py-2 text-[0.8125rem] font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-nav-item-hover)] disabled:opacity-50">
                {pending === project.key ? (isZh ? '保存中…' : 'Saving…') : (isZh ? '保存' : 'Save')}
              </button>
              <button type="button" disabled={pending === `delete:${project.key}`} onClick={() => void remove(project)} className="rounded-full border border-[var(--color-nav-dropdown-border)] px-4 py-2 text-[0.8125rem] text-[var(--color-nav-dropdown-description)] transition-colors hover:border-[var(--roadmap-priority-high-fg)] hover:text-[var(--roadmap-priority-high-fg)] disabled:opacity-50">
                {isZh ? '删除项目' : 'Delete project'}
              </button>
            </div>
          </article>
        ))}
      </div>
      {message && <p role="status" className="text-[0.8125rem] text-[var(--color-nav-dropdown-description)]">{message}</p>}
    </section>
  );
}
