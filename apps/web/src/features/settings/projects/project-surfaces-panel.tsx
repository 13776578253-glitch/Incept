'use client';

import { useEffect, useState } from 'react';

type Project = {
  key: string;
  name: { en: string; zh: string };
  roadmapEnabled: boolean;
  atlasEnabled: boolean;
};

// 常见中英双向映射词典
const ZH_EN_EXACT_MAP: Record<string, string> = {
  '项目一': 'Project One',
  '项目二': 'Project Two',
  '项目三': 'Project Three',
  '项目四': 'Project Four',
  '项目五': 'Project Five',
  '项目六': 'Project Six',
  '项目七': 'Project Seven',
  '项目八': 'Project Eight',
  '项目九': 'Project Nine',
  '项目十': 'Project Ten',
  '新项目': 'New Project',
  '默认项目': 'Default Project',
};

const EN_ZH_EXACT_MAP: Record<string, string> = {
  'Project One': '项目一',
  'Project Two': '项目二',
  'Project Three': '项目三',
  'Project Four': '项目四',
  'Project Five': '项目五',
  'Project Six': '项目六',
  'Project Seven': '项目七',
  'Project Eight': '项目八',
  'Project Nine': '项目九',
  'Project Ten': '项目十',
  'New Project': '新项目',
  'Default Project': '默认项目',
};

const ZH_TO_EN_WORDS: Array<[string, string]> = [
  ['项目', 'Project '],
  ['路线图', 'Roadmap '],
  ['规划图', 'Planning Board '],
  ['看板', 'Board '],
  ['移动端', 'Mobile '],
  ['桌面端', 'Desktop '],
  ['网页端', 'Web '],
  ['前端', 'Frontend '],
  ['后端', 'Backend '],
  ['服务端', 'Server '],
  ['客户端', 'Client '],
  ['音乐', 'Music '],
  ['播放器', 'Player '],
  ['样式', 'Style '],
  ['设置', 'Settings '],
  ['账户', 'Account '],
  ['用户', 'User '],
  ['文档', 'Docs '],
  ['系统', 'System '],
  ['平台', 'Platform '],
  ['应用', 'App '],
  ['重构', 'Refactoring '],
  ['优化', 'Optimization '],
  ['测试', 'Testing '],
  ['设计', 'Design '],
  ['核心', 'Core '],
  ['基础', 'Base '],
  ['通用', 'Common '],
  ['管理', 'Admin '],
  ['后台', 'Dashboard '],
  ['中心', 'Center '],
  ['数据', 'Data '],
  ['分析', 'Analytics '],
  ['报表', 'Report '],
  ['任务', 'Task '],
  ['团队', 'Team '],
  ['工作区', 'Workspace '],
  ['资源', 'Resource '],
  ['配置', 'Config '],
  ['服务', 'Service '],
  ['接口', 'API '],
  ['网关', 'Gateway '],
  ['开发', 'Dev '],
  ['研发', 'R&D '],
  ['运维', 'Ops '],
  ['博客', 'Blog '],
  ['搜索', 'Search '],
  ['探索', 'Explore '],
  ['智能', 'AI '],
  ['创新', 'Innovation '],
  ['功能', 'Feature '],
  ['产品', 'Product '],
  ['一', 'One'],
  ['二', 'Two'],
  ['三', 'Three'],
  ['四', 'Four'],
  ['五', 'Five'],
  ['六', 'Six'],
  ['七', 'Seven'],
  ['八', 'Eight'],
  ['九', 'Nine'],
  ['十', 'Ten'],
];

const EN_TO_ZH_WORDS: Array<[RegExp, string]> = [
  [/Project/gi, '项目'],
  [/Roadmap/gi, '路线图'],
  [/Planning Board/gi, '规划图'],
  [/Board/gi, '看板'],
  [/Mobile/gi, '移动端'],
  [/Desktop/gi, '桌面端'],
  [/Web/gi, '网页端'],
  [/Frontend/gi, '前端'],
  [/Backend/gi, '后端'],
  [/Server/gi, '服务端'],
  [/Client/gi, '客户端'],
  [/Music/gi, '音乐'],
  [/Player/gi, '播放器'],
  [/Style/gi, '样式'],
  [/Settings/gi, '设置'],
  [/Account/gi, '账户'],
  [/User/gi, '用户'],
  [/Docs/gi, '文档'],
  [/System/gi, '系统'],
  [/Platform/gi, '平台'],
  [/App/gi, '应用'],
  [/Refactoring/gi, '重构'],
  [/Optimization/gi, '优化'],
  [/Testing/gi, '测试'],
  [/Design/gi, '设计'],
  [/Core/gi, '核心'],
  [/Base/gi, '基础'],
  [/Common/gi, '通用'],
  [/Admin/gi, '管理'],
  [/Dashboard/gi, '后台'],
  [/Center/gi, '中心'],
  [/Data/gi, '数据'],
  [/Analytics/gi, '分析'],
  [/Report/gi, '报表'],
  [/Task/gi, '任务'],
  [/Team/gi, '团队'],
  [/Workspace/gi, '工作区'],
  [/Resource/gi, '资源'],
  [/Config/gi, '配置'],
  [/Service/gi, '服务'],
  [/API/gi, '接口'],
  [/Gateway/gi, '网关'],
  [/Dev/gi, '开发'],
  [/R&D/gi, '研发'],
  [/Ops/gi, '运维'],
  [/Blog/gi, '博客'],
  [/Search/gi, '搜索'],
  [/Explore/gi, '探索'],
  [/AI/gi, '智能'],
  [/Innovation/gi, '创新'],
  [/Feature/gi, '功能'],
  [/Product/gi, '产品'],
  [/One/gi, '一'],
  [/Two/gi, '二'],
  [/Three/gi, '三'],
  [/Four/gi, '四'],
  [/Five/gi, '五'],
  [/Six/gi, '六'],
  [/Seven/gi, '七'],
  [/Eight/gi, '八'],
  [/Nine/gi, '九'],
  [/Ten/gi, '十'],
];

function translateProjectName(input: string, sourceLocale: 'zh' | 'en'): { zh: string; en: string } {
  const text = input.trim();
  if (!text) return { zh: '', en: '' };

  const hasChinese = /[\u4e00-\u9fa5]/.test(text);

  if (hasChinese) {
    if (ZH_EN_EXACT_MAP[text]) {
      return { zh: text, en: ZH_EN_EXACT_MAP[text] };
    }
    let en = text;
    for (const [zhWord, enWord] of ZH_TO_EN_WORDS) {
      en = en.split(zhWord).join(enWord);
    }
    en = en.replace(/\s+/g, ' ').trim();
    en = en.replace(/\b[a-z]/g, (c) => c.toUpperCase());
    return { zh: text, en: en || text };
  } else {
    for (const [enKey, zhVal] of Object.entries(EN_ZH_EXACT_MAP)) {
      if (enKey.toLowerCase() === text.toLowerCase()) {
        return { zh: zhVal, en: text };
      }
    }
    let zh = text;
    for (const [reg, zhWord] of EN_TO_ZH_WORDS) {
      zh = zh.replace(reg, zhWord);
    }
    zh = zh.replace(/\s+/g, '').trim();
    return { zh: zh || text, en: text };
  }
}

function slugifyKey(name: string, fallbackSeed = ''): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug) return slug;

  let hash = 0;
  for (let i = 0; i < fallbackSeed.length; i += 1) {
    hash = (hash * 31 + fallbackSeed.charCodeAt(i)) >>> 0;
  }
  return `project-${hash ? hash.toString(36).slice(0, 6) : Date.now().toString(36).slice(-4)}`;
}

function resolveUniqueKey(base: string, existingKeys: string[]): string {
  const prefix = base || 'project';
  if (!existingKeys.includes(prefix)) return prefix;
  let counter = 2;
  while (existingKeys.includes(`${prefix}-${counter}`)) {
    counter += 1;
  }
  return `${prefix}-${counter}`;
}

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
  const [newProjectName, setNewProjectName] = useState('');
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
    const trimmed = newProjectName.trim();
    if (!trimmed) return;
    setPending('new');
    setMessage('');
    try {
      const translated = translateProjectName(trimmed, isZh ? 'zh' : 'en');
      const baseKey = slugifyKey(translated.en, trimmed);
      const existingKeys = projects.map((p) => p.key);
      const key = resolveUniqueKey(baseKey, existingKeys);
      const response = await fetch('/api/internal/roadmap/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          key,
          name: {
            en: (translated.en || trimmed).trim(),
            zh: (translated.zh || trimmed).trim(),
          },
        }),
      });
      const payload = await response.json() as { project?: Project; error?: string };
      if (!response.ok || !payload.project) throw new Error(payload.error);
      setProjects((current) => [...current, payload.project!]);
      setNewProjectName('');
      setMessage(isZh ? '项目已创建。' : 'Project created.');
    } catch (error) {
      setMessage(error instanceof Error && error.message ? error.message : (isZh ? '创建失败，请重试。' : 'Could not create the project.'));
    } finally {
      setPending(null);
    }
  }

  return (
    <section id="projects" className="max-w-[760px] space-y-6">
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="text-[length:var(--text-xl)] font-semibold tracking-[-0.025em] text-[var(--color-text)]">
            {isZh ? '项目与功能' : 'Projects & surfaces'}
          </h2>
          <span className="text-[length:var(--text-2xs)] font-medium tabular-nums text-[var(--color-text-soft)]">
            {projects.length} {isZh ? '个项目' : projects.length === 1 ? 'project' : 'projects'}
          </span>
        </div>
        <p className="text-[length:var(--text-sm)] leading-relaxed text-[var(--color-text-muted)]">
          {isZh ? '创建项目、调整展示名称并切换路线图或规划图功能状态' : 'Create projects, rename titles, and toggle Roadmap or Planning Board visibility'}
        </p>
      </header>

      {message && (
        <div
          role="status"
          className={`flex items-center justify-between gap-3 rounded-[10px] border px-3.5 py-2.5 text-[length:var(--text-sm)] transition-all animate-in fade-in duration-150 ${
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
            className="text-[length:var(--text-xs)] opacity-70 transition-opacity hover:opacity-100 cursor-pointer"
            aria-label={isZh ? '关闭提示' : 'Dismiss'}
          >
            ✕
          </button>
        </div>
      )}

      {/* 创建新项目：扁平单行创建条 */}
      <form
        id="projects-create"
        onSubmit={(event) => void createProject(event)}
        className="space-y-2 border-b border-[var(--color-border-faint)] pb-5"
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <input
              required
              value={newProjectName}
              onChange={(event) => setNewProjectName(event.target.value)}
              placeholder={isZh ? '例如：新项目' : 'e.g. New Project'}
              aria-label={isZh ? '项目名称' : 'Project Name'}
              className="h-9 w-full rounded-[9px] border border-[var(--color-border-input)] bg-[var(--color-surface-card,var(--color-bg))] px-3 text-[length:var(--text-sm)] text-[var(--color-text)] outline-none transition-colors placeholder:text-[var(--color-text-soft)] focus:border-[var(--color-border-focus)] focus:ring-2 focus:ring-[var(--color-ring-focus)]"
            />
          </div>
          <button
            type="submit"
            disabled={pending === 'new'}
            className="inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-[9px] bg-[var(--color-primary-bg)] px-3.5 text-[length:var(--text-xs)] font-medium text-[color:var(--color-primary-fg)] transition-all hover:brightness-[1.06] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 3.5v9M3.5 8h9" />
            </svg>
            <span>{pending === 'new' ? (isZh ? '创建中…' : 'Creating…') : (isZh ? '创建项目' : 'Create project')}</span>
          </button>
        </div>
        <p className="text-[length:var(--text-xs)] text-[var(--color-text-soft)]">
          {isZh ? '新项目默认同时启用路线图与规划图，支持在下方列表中修改展示名称' : 'New projects start with both surfaces enabled'}
        </p>
      </form>

      {/* 已有项目列表：无外框扁平分割线列表 */}
      <div id="projects-list" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[length:var(--text-sm)] font-medium text-[var(--color-text)]">
            {isZh ? '已有项目' : 'Configured Projects'}
          </h3>
          <span className="text-[length:var(--text-xs)] text-[var(--color-text-soft)]">
            {isZh ? '编辑名称后点击保存即可更新' : 'Rename inline and save changes'}
          </span>
        </div>

        {projects.length === 0 ? (
          <div className="rounded-[10px] border border-dashed border-[var(--color-border)] p-8 text-center">
            <p className="text-[length:var(--text-sm)] text-[var(--color-text-muted)]">
              {isZh ? '暂无项目，可在上方输入名称直接创建' : 'No projects configured. Create your first project above'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--color-border-faint)] border-t border-[var(--color-border-faint)]">
            {projects.map((project) => (
              <article
                key={project.key}
                className="-mx-2 rounded-[10px] px-2 py-3.5 transition-colors hover:bg-[var(--color-surface-subtle)]"
              >
                <div className="flex flex-wrap items-center justify-between gap-2.5">
                  {/* 左栏：静默内联可编辑项目名 + 项目标识 */}
                  <div className="flex min-w-[160px] flex-1 items-center gap-2">
                    <input
                      value={isZh ? (project.name.zh || project.name.en) : (project.name.en || project.name.zh)}
                      onChange={(event) => {
                        const val = event.target.value;
                        const auto = translateProjectName(val, isZh ? 'zh' : 'en');
                        update(project.key, {
                          name: isZh
                            ? { zh: val, en: auto.en || project.name.en || val }
                            : { en: val, zh: auto.zh || project.name.zh || val },
                        });
                      }}
                      placeholder={isZh ? '例如：项目一' : 'e.g. Project One'}
                      className="h-8 min-w-[120px] flex-1 -ml-1.5 rounded-[7px] border border-transparent bg-transparent px-1.5 text-[length:var(--text-sm)] font-medium text-[var(--color-text)] outline-none transition-colors placeholder:text-[var(--color-text-soft)] hover:bg-[var(--color-surface-hover)] focus:border-[var(--color-border-focus)] focus:bg-[var(--color-surface-card,var(--color-bg))]"
                    />
                    <span className="shrink-0 font-mono text-[length:var(--text-2xs)] text-[var(--color-text-soft)]">
                      {project.key}
                    </span>
                  </div>

                  {/* 右栏：强调色联动开关 + 保存与删除 */}
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
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
                            className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[length:var(--text-2xs)] font-medium transition-all duration-150 ${
                              enabled
                                ? 'border-[var(--color-border-strong)] bg-[var(--surface-pill-on-bg,var(--color-surface-card))] text-[var(--color-text)] shadow-[var(--shadow-pill-active)]'
                                : 'border-dashed border-[var(--color-border-strong)] bg-transparent text-[var(--color-text-muted)] hover:not-disabled:border-[var(--color-text-muted)] hover:not-disabled:text-[var(--color-text)]'
                            } ${wouldDisableLast ? 'cursor-not-allowed' : 'cursor-pointer active:scale-95'}`}
                          >
                            <span
                              aria-hidden="true"
                              className={`size-1.5 shrink-0 rounded-full transition-colors ${
                                enabled
                                  ? 'bg-[var(--color-accent)] shadow-[0_0_0_2.5px_var(--color-accent-soft)]'
                                  : 'bg-[var(--color-text-soft)]'
                              }`}
                            />
                            <span>{label}</span>
                            <span className="font-normal opacity-80">
                              {enabled ? (isZh ? '启用' : 'Enabled') : (isZh ? '停用' : 'Disabled')}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    <span aria-hidden="true" className="hidden h-4 w-px bg-[var(--color-border-faint)] sm:inline-block" />

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={pending === project.key}
                        onClick={() => void save(project)}
                        className="inline-flex h-7 cursor-pointer items-center justify-center rounded-[6px] border border-[var(--color-border-subtle)] bg-[var(--color-surface-card,var(--color-bg))] px-2.5 text-[length:var(--text-xs)] font-medium text-[var(--color-text)] transition-colors hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-hover)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
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
                        className={`inline-flex h-7 cursor-pointer items-center justify-center rounded-[6px] px-2.5 text-[length:var(--text-xs)] font-medium transition-colors ${
                          confirmingDelete === project.key
                            ? 'bg-[var(--badge-rose-bg)] text-[var(--badge-rose-fg)]'
                            : 'text-[var(--color-text-muted)] hover:bg-[var(--badge-rose-bg)] hover:text-[var(--badge-rose-fg)]'
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
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

