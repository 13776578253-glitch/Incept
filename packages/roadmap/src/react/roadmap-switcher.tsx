import type { Roadmap, RoadmapLocale } from '../domain';

type RoadmapSwitcherProps = {
  roadmaps: readonly Roadmap[];
  currentKey: string;
  locale: RoadmapLocale;
  hrefFor: (roadmapKey: string) => string;
  label: string;
};

// 看板切换导航：基于 URL 查询参数进行无状态导航，无客户端额外状态存储。
export function RoadmapSwitcher({
  roadmaps,
  currentKey,
  locale,
  hrefFor,
  label,
}: RoadmapSwitcherProps) {
  return (
    <nav
      aria-label={label}
      className="inline-flex flex-wrap items-center gap-1 rounded-full border border-[var(--roadmap-border,var(--color-border))] bg-[var(--roadmap-lane-bg)] p-1"
    >
      <span className="sr-only">{label}</span>
      {roadmaps.map((roadmap) => {
        const current = roadmap.key === currentKey;

        return (
          <a
            key={roadmap.key}
            href={hrefFor(roadmap.key)}
            aria-current={current ? 'true' : undefined}
            className={`inline-flex items-center rounded-full px-3.5 py-1 text-[0.8rem] font-medium transition-all ${
              current
                ? 'border border-[var(--roadmap-border,var(--color-border))] bg-[var(--roadmap-card-bg,var(--color-bg))] text-[var(--color-text)] shadow-[0_1px_2px_rgba(15,23,42,0.06)]'
                : 'border border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
            }`}
          >
            {roadmap.name[locale]}
          </a>
        );
      })}
    </nav>
  );
}

