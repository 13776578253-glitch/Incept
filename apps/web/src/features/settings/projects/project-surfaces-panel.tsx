'use client';

import { useEffect, useState } from 'react';

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
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const isZh = language === 'zh';

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => {
      setMessage('');
    }, 4000);
    return () => clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    if (!confirmingDelete) return;
    const timer = setTimeout(() => {
      setConfirmingDelete(null);
    }, 4000);
    return () => clearTimeout(timer);
  }, [confirmingDelete]);

  async function save(project: Project) {
    if (!project.roadmapEnabled && !project.atlasEnabled) {
      setMessage(isZh ? '至少保留路线图或规划图中的一项。' : 'Keep at least one surface enabled.');
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
        body: JSON.stringify({ key: newProject.key.trim().toLowerCase(), name: { en: newProject.en.trim(), zh: newProject.zh.trim() } }),
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
    <section id="projects" className="max-w-[760px] space-y-7">
      <header className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="text-[1.18rem] font-semibold tracking-[-0.03em] text-[var(--color-text)]">
            {isZh ? '项目与功能' : 'Projects & surfaces'}
          </h2>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--surface-chip-border)] bg-[var(--surface-chip-bg)] px-2.5 py-0.5 text-[0.72rem] font-medium tabular-nums text-[var(--color-nav-muted)]">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-[var(--badge-sky-dot)]" />
            {projects.length} {isZh ? '个项目' : projects.length === 1 ? 'project' : 'projects'}
          </span>
        </div>
        <p className="max-w-2xl text-[0.8125rem] leading-6 text-[var(--color-nav-dropdown-description)]">
          {isZh
            ? '每个项目可分别启用路线图和规划图。两种入口始终显示；关闭的功能会以锁定状态呈现。'
            : 'Enable Roadmap and Planning Board per project. Both entry points stay visible, with disabled surfaces shown as locked.'}
        </p>
      </header>

      {message && (
        <div
          role="status"
          className={`flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-[0.8125rem] transition-all animate-in fade-in duration-150 ${
            message.includes('失败') || message.includes('failed') || message.includes('至少保留') || message.includes('at least one')
              ? 'border-[var(--badge-amber-border)] bg-[var(--badge-amber-bg)] text-[var(--badge-amber-fg)]'
              : 'border-[var(--badge-emerald-border)] bg-[var(--badge-emerald-bg)] text-[var(--badge-emerald-fg)]'
          }`}
        >
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="size-1.5 shrink-0 rounded-full"
              style={{
                backgroundColor:
                  message.includes('失败') || message.includes('failed') || message.includes('至少保留') || message.includes('at least one')
                    ? 'var(--badge-amber-dot)'
                    : 'var(--badge-emerald-dot)',
              }}
            />
            <span>{message}</span>
          </div>
          <button
            type="button"
            onClick={() => setMessage('')}
            className="text-[0.75rem] opacity-70 hover:opacity-100 transition-opacity"
            aria-label={isZh ? '关闭提示' : 'Dismiss'}
          >
            ✕
          </button>
        </div>
      )}

      {/* 创建新项目 */}
      <form
        onSubmit={(event) => void createProject(event)}
        className="rounded-2xl bg-[color:var(--color-row-bg)] p-5 space-y-4 transition-colors hover:bg-[color:var(--color-row-hover-bg)]"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-full bg-[var(--color-bg)] text-[var(--badge-sky-icon)] shadow-[var(--shadow-card-sm)]">
              <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3.5v9M3.5 8h9" />
              </svg>
            </span>
            <h3 className="text-[0.9375rem] font-medium text-[var(--color-text)]">
              {isZh ? '新建项目' : 'Create Project'}
            </h3>
          </div>
          <span className="text-[0.75rem] text-[var(--color-nav-muted)]">
            {isZh ? '默认启用路线图与规划图' : 'Starts with both surfaces enabled'}
          </span>
        </div>

        <div className="grid gap-3.5 sm:grid-cols-2">
          <label className="space-y-1.5 text-[0.78rem] font-medium text-[var(--color-nav-dropdown-description)] sm:col-span-2">
            <div className="flex items-center justify-between">
              <span>{isZh ? '项目标识 (Key)' : 'Project Key'}</span>
              <span className="text-[0.72rem] text-[var(--color-nav-muted)]">
                {isZh ? '小写字母、数字及连字符，如 my-project' : 'lowercase letters, numbers & hyphens'}
              </span>
            </div>
            <input
              required
              pattern="[a-z0-9][a-z0-9-]*"
              value={newProject.key}
              onChange={(event) => setNewProject({ ...newProject, key: event.target.value.toLowerCase() })}
              placeholder="my-project"
              className="min-h-10 w-full rounded-[12px] bg-[var(--color-bg)] px-3.5 font-mono text-[0.8125rem] text-[var(--color-text)] outline-none shadow-[var(--shadow-card-sm)] transition-all placeholder:font-sans placeholder:text-[var(--color-nav-muted)]"
            />
          </label>
          <label className="space-y-1.5 text-[0.78rem] font-medium text-[var(--color-nav-dropdown-description)]">
            <span>{isZh ? '中文名称' : 'Chinese name'}</span>
            <input
              required
              value={newProject.zh}
              onChange={(event) => setNewProject({ ...newProject, zh: event.target.value })}
              placeholder={isZh ? '例如：新项目' : 'e.g. New Project'}
              className="min-h-10 w-full rounded-[12px] bg-[var(--color-bg)] px-3.5 text-[0.8125rem] text-[var(--color-text)] outline-none shadow-[var(--shadow-card-sm)] transition-all placeholder:text-[var(--color-nav-muted)]"
            />
          </label>
          <label className="space-y-1.5 text-[0.78rem] font-medium text-[var(--color-nav-dropdown-description)]">
            <span>{isZh ? '英文名称' : 'English name'}</span>
            <input
              required
              value={newProject.en}
              onChange={(event) => setNewProject({ ...newProject, en: event.target.value })}
              placeholder={isZh ? '例如：New Project' : 'e.g. New Project'}
              className="min-h-10 w-full rounded-[12px] bg-[var(--color-bg)] px-3.5 text-[0.8125rem] text-[var(--color-text)] outline-none shadow-[var(--shadow-card-sm)] transition-all placeholder:text-[var(--color-nav-muted)]"
            />
          </label>
        </div>

        <div className="flex items-center justify-end pt-1">
          <button
            type="submit"
            disabled={pending === 'new'}
            className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full bg-[var(--color-bg)] px-4 text-[0.8125rem] font-medium text-[var(--color-text)] shadow-[var(--shadow-pill-active)] transition-all hover:bg-[color:var(--color-row-hover-bg)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 3.5v9M3.5 8h9" />
            </svg>
            <span>{pending === 'new' ? (isZh ? '创建中…' : 'Creating…') : (isZh ? '创建项目' : 'Create project')}</span>
          </button>
        </div>
      </form>

      {/* 已有项目列表 */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[0.9375rem] font-semibold tracking-[-0.01em] text-[var(--color-text)]">
            {isZh ? '已有项目' : 'Configured Projects'}
          </h3>
          <span className="text-[0.75rem] text-[var(--color-nav-muted)]">
            {isZh ? '可在此调整项目名称与功能开关' : 'Manage project names and surface toggles'}
          </span>
        </div>

        {projects.length === 0 ? (
          <div className="rounded-2xl bg-[color:var(--color-row-bg)] p-8 text-center">
            <p className="text-[0.8125rem] text-[var(--color-nav-muted)]">
              {isZh ? '暂无项目，可在上方表单中创建新项目。' : 'No projects configured. Create your first project above.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {projects.map((project) => (
              <article
                key={project.key}
                className="rounded-2xl bg-[color:var(--color-row-bg)] p-5 space-y-4 transition-colors hover:bg-[color:var(--color-row-hover-bg)]"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-[8px] bg-[var(--color-bg)] text-[var(--color-text-muted)] shadow-[var(--shadow-card-sm)]">
                      <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.4">
                        <rect x="2.5" y="3" width="11" height="10" rx="2" />
                        <path d="M2.5 6.5h11M6.5 6.5v6.5" />
                      </svg>
                    </span>
                    <span className="font-semibold text-[0.9375rem] text-[var(--color-text)] truncate">
                      {(isZh ? project.name.zh || project.name.en : project.name.en || project.name.zh) || project.key}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-bg)] px-2.5 py-0.5 font-mono text-[0.7rem] text-[var(--color-text-muted)] shadow-[var(--shadow-card-sm)]">
                      <span aria-hidden="true" className="size-1.5 rounded-full bg-[var(--badge-sky-dot)]" />
                      {project.key}
                    </span>
                  </div>
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[0.68rem] font-medium"
                    style={{
                      color: project.roadmapEnabled && project.atlasEnabled
                        ? 'var(--badge-emerald-fg)'
                        : 'var(--badge-amber-fg)',
                      backgroundColor: project.roadmapEnabled && project.atlasEnabled
                        ? 'var(--badge-emerald-bg)'
                        : 'var(--badge-amber-bg)',
                    }}
                  >
                    <span
                      aria-hidden="true"
                      className="size-1.5 rounded-full"
                      style={{
                        backgroundColor: project.roadmapEnabled && project.atlasEnabled
                          ? 'var(--badge-emerald-dot)'
                          : 'var(--badge-amber-dot)',
                      }}
                    />
                    {project.roadmapEnabled && project.atlasEnabled
                      ? (isZh ? '全部启用' : 'All Enabled')
                      : project.roadmapEnabled
                        ? (isZh ? '仅路线图' : 'Roadmap Only')
                        : (isZh ? '仅规划图' : 'Planning Only')}
                  </span>
                </div>

                <div className="grid gap-3.5 sm:grid-cols-2">
                  <label className="space-y-1.5 text-[0.78rem] font-medium text-[var(--color-nav-dropdown-description)]">
                    <span>{isZh ? '中文名称' : 'Chinese name'}</span>
                    <input
                      value={project.name.zh}
                      onChange={(event) => update(project.key, { name: { ...project.name, zh: event.target.value } })}
                      placeholder={isZh ? '例如：项目一' : 'e.g. Project One'}
                      className="min-h-10 w-full rounded-[12px] bg-[var(--color-bg)] px-3.5 text-[0.8125rem] text-[var(--color-text)] outline-none shadow-[var(--shadow-card-sm)] transition-all placeholder:text-[var(--color-nav-muted)]"
                    />
                  </label>
                  <label className="space-y-1.5 text-[0.78rem] font-medium text-[var(--color-nav-dropdown-description)]">
                    <span>{isZh ? '英文名称' : 'English name'}</span>
                    <input
                      value={project.name.en}
                      onChange={(event) => update(project.key, { name: { ...project.name, en: event.target.value } })}
                      placeholder={isZh ? '例如：Project One' : 'e.g. Project One'}
                      className="min-h-10 w-full rounded-[12px] bg-[var(--color-bg)] px-3.5 text-[0.8125rem] text-[var(--color-text)] outline-none shadow-[var(--shadow-card-sm)] transition-all placeholder:text-[var(--color-nav-muted)]"
                    />
                  </label>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3.5 pt-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[0.75rem] font-medium text-[var(--color-nav-muted)] mr-1">
                      {isZh ? '功能状态：' : 'Surfaces:'}
                    </span>
                    {(['roadmapEnabled', 'atlasEnabled'] as const).map((field) => {
                      const enabled = project[field];
                      const wouldDisableLast = enabled && (field === 'roadmapEnabled' ? !project.atlasEnabled : !project.roadmapEnabled);
                      const label = field === 'roadmapEnabled' ? (isZh ? '路线图' : 'Roadmap') : (isZh ? '规划图' : 'Planning Board');
                      return (
                        <button
                          key={field}
                          type="button"
                          role="switch"
                          aria-checked={enabled}
                          disabled={wouldDisableLast}
                          title={wouldDisableLast ? (isZh ? '至少保留路线图或规划图中的一项' : 'Keep at least one surface enabled') : undefined}
                          onClick={() => update(project.key, { [field]: !enabled })}
                          className={`inline-flex min-h-8 items-center gap-2 rounded-full px-3 py-1 text-[0.8125rem] font-medium transition-all duration-150 ${
                            enabled
                              ? 'bg-[var(--color-bg)] text-[var(--color-text)] shadow-[var(--shadow-pill-active)]'
                              : 'bg-transparent text-[var(--color-nav-muted)] hover:text-[var(--color-text)]'
                          } ${wouldDisableLast ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                        >
                          <span
                            aria-hidden="true"
                            className="size-1.5 shrink-0 rounded-full transition-colors"
                            style={{
                              backgroundColor: enabled ? 'var(--badge-emerald-dot)' : 'var(--color-nav-muted)',
                            }}
                          />
                          <span>{label}</span>
                          <span
                            className={`text-[0.7rem] font-normal tracking-tight ${
                              enabled ? 'text-[var(--badge-emerald-fg)]' : 'text-[var(--color-nav-muted)]'
                            }`}
                          >
                            {enabled ? (isZh ? '已开启' : 'On') : (isZh ? '已关闭' : 'Off')}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={pending === project.key}
                      onClick={() => void save(project)}
                      className="inline-flex min-h-8 items-center justify-center rounded-full bg-[var(--color-bg)] px-4 text-[0.8125rem] font-medium text-[var(--color-text)] shadow-[var(--shadow-pill-active)] transition-all hover:bg-[color:var(--color-row-hover-bg)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {pending === project.key ? (isZh ? '保存中…' : 'Saving…') : (isZh ? '保存' : 'Save')}
                    </button>
                    <button
                      type="button"
                      disabled={pending === `delete:${project.key}`}
                      onClick={() => {
                        if (confirmingDelete === project.key) {
                          void remove(project);
                          setConfirmingDelete(null);
                        } else {
                          setConfirmingDelete(project.key);
                        }
                      }}
                      className={`inline-flex min-h-8 items-center justify-center rounded-full px-3 text-[0.8125rem] font-medium transition-colors ${
                        confirmingDelete === project.key
                          ? 'bg-[var(--badge-rose-bg)] text-[var(--badge-rose-fg)]'
                          : 'text-[var(--color-nav-muted)] hover:bg-[var(--badge-rose-bg)] hover:text-[var(--badge-rose-fg)]'
                      } disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      {pending === `delete:${project.key}`
                        ? (isZh ? '删除中…' : 'Deleting…')
                        : confirmingDelete === project.key
                          ? (isZh ? '确认删除？' : 'Confirm?')
                          : (isZh ? '删除项目' : 'Delete')}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

